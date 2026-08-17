const pool = require('../config/db');


/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */


/*
   Obtiene empresa_id desde el JWT.

   Cada usuario solamente puede trabajar con
   ventas, productos e inventario de su empresa.
*/
function obtenerEmpresaId(req) {
  return Number(req.user?.empresa_id);
}


/*
   Convierte un valor a número.
*/
function convertirNumero(valor) {

  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : NaN;
}



/* =========================================================
   VENTAS DEL DÍA

   En el modelo maestro de CCC una venta terminada
   se registra como:

   pedidos
      ↓
   detalle_pedido

   Para no modificar el frontend de CCC-Básico,
   la API sigue devolviendo:

   {
     total_dia,
     ventas,
     detalles
   }
========================================================= */


/* =========================================================
   LISTAR VENTAS DE HOY
   GET /api/ventas/hoy
========================================================= */

async function ventasHoy(req, res) {

  try {

    const empresaId =
      obtenerEmpresaId(req);


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    /* =====================================================
       1. LISTAR VENTAS
    ===================================================== */

    /*
       Antes:

       ventas.fecha
       ventas.medio_pago

       Ahora:

       pedidos.creado_en / cerrado_en
       pedidos.metodo_pago

       Usamos alias para no romper app.js.
    */

    const ventasResult = await pool.query(
      `
      SELECT

        p.id,

        COALESCE(
          p.cerrado_en,
          p.creado_en
        ) AS fecha,

        p.total,

        p.metodo_pago
          AS medio_pago,

        u.nombre
          AS usuario

      FROM public.pedidos p

      LEFT JOIN public.usuarios u
        ON u.id = p.usuario_id

      WHERE p.empresa_id = $1

        AND COALESCE(
              p.cerrado_en,
              p.creado_en
            )::date = CURRENT_DATE

        AND (
          p.cerrado_en IS NOT NULL
          OR UPPER(COALESCE(p.estado, '')) IN (
            'CERRADO',
            'PAGADO',
            'COMPLETADO',
            'FINALIZADO'
          )
        )

      ORDER BY
        COALESCE(
          p.cerrado_en,
          p.creado_en
        ) DESC
      `,
      [empresaId]
    );


    /* =====================================================
       2. TOTAL DEL DÍA
    ===================================================== */

    const totalResult = await pool.query(
      `
      SELECT

        COALESCE(
          SUM(total),
          0
        ) AS total_dia

      FROM public.pedidos

      WHERE empresa_id = $1

        AND COALESCE(
              cerrado_en,
              creado_en
            )::date = CURRENT_DATE

        AND (
          cerrado_en IS NOT NULL
          OR UPPER(COALESCE(estado, '')) IN (
            'CERRADO',
            'PAGADO',
            'COMPLETADO',
            'FINALIZADO'
          )
        )
      `,
      [empresaId]
    );


    /* =====================================================
       3. DETALLE DE LAS VENTAS
    ===================================================== */

    /*
       El frontend antiguo espera:

       venta_id
       producto_venta_id
       producto
       cantidad
       precio_unitario
       subtotal

       Ahora:

       pedido_id     → venta_id
       menu_id       → producto_venta_id
    */

    const detalleResult = await pool.query(
      `
      SELECT

        d.id,

        d.pedido_id
          AS venta_id,

        d.menu_id
          AS producto_venta_id,

        m.nombre
          AS producto,

        d.cantidad,

        d.precio_unitario,

        d.subtotal

      FROM public.detalle_pedido d

      INNER JOIN public.pedidos p
        ON p.id = d.pedido_id

      INNER JOIN public.menu m
        ON m.id = d.menu_id

      WHERE p.empresa_id = $1

        AND m.empresa_id = $1

        AND COALESCE(
              p.cerrado_en,
              p.creado_en
            )::date = CURRENT_DATE

        AND (
          p.cerrado_en IS NOT NULL
          OR UPPER(COALESCE(p.estado, '')) IN (
            'CERRADO',
            'PAGADO',
            'COMPLETADO',
            'FINALIZADO'
          )
        )

      ORDER BY d.id DESC
      `,
      [empresaId]
    );


    /* =====================================================
       RESPUESTA
    ===================================================== */

    return res.json({

      total_dia:
        Number(
          totalResult.rows[0]
            .total_dia || 0
        ),

      ventas:
        ventasResult.rows,

      detalles:
        detalleResult.rows

    });


  } catch (error) {

    console.error(
      'Error ventasHoy:',
      error
    );


    return res.status(500).json({

      message:
        'Error al listar ventas del día',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   CREAR VENTA
   POST /api/ventas
========================================================= */

/*
   Flujo completo:

   menu
      ↓
   recetas
      ↓
   receta_detalle
      ↓
   tipo_porcion
      ↓
   porciones

   Después:

   pedidos
      ↓
   detalle_pedido

   Finalmente se descuenta el stock de Cocina.
*/

async function crearVenta(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);


    const {
      items,
      medio_pago = 'efectivo'
    } = req.body;


    /* =====================================================
       VALIDAR EMPRESA
    ===================================================== */

    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    /* =====================================================
       VALIDAR MEDIO DE PAGO
    ===================================================== */

    const medioPagoNormalizado =
      String(medio_pago)
        .trim()
        .toLowerCase();


    const mediosPermitidos = [
      'efectivo',
      'debito',
      'credito',
      'transferencia'
    ];


    if (
      !mediosPermitidos.includes(
        medioPagoNormalizado
      )
    ) {

      return res.status(400).json({
        message:
          'Medio de pago inválido'
      });

    }


    /* =====================================================
       VALIDAR ITEMS
    ===================================================== */

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {

      return res.status(400).json({
        message:
          'La venta debe tener al menos un producto'
      });

    }


    await client.query('BEGIN');


    /*
       Aquí guardaremos posteriormente
       los productos vendidos.
    */

    const detallesVenta = [];


    /*
       Aquí acumularemos cuánto stock de Cocina
       necesitamos consumir.

       La clave será:

       materia_prima_id + gramos

       Ejemplo:

       5:200

       = materia prima 5
       = porción 200 gramos
    */

    const ingredientesNecesarios =
      new Map();


    let totalVenta = 0;



    /* =====================================================
       1. RECORRER PRODUCTOS DE LA VENTA
    ===================================================== */

    for (const item of items) {

      /*
         El frontend todavía utiliza:

         producto_venta_id

         Pero actualmente este ID corresponde a:

         public.menu.id
      */

      const productoId =
        Number(
          item.producto_venta_id
        );


      const cantidadVendida =
        Number(
          item.cantidad
        );


      /*
         detalle_pedido.cantidad es INTEGER.

         Por eso solamente aceptamos
         cantidades enteras positivas.
      */

      if (
        !productoId ||
        !Number.isInteger(
          cantidadVendida
        ) ||
        cantidadVendida <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          message:
            'Producto o cantidad inválida'
        });

      }



      /* ===================================================
         2. BUSCAR PRODUCTO EN MENU
      =================================================== */

      const productoResult =
        await client.query(
          `
          SELECT
            id,
            nombre,
            precio,
            activo,
            empresa_id

          FROM public.menu

          WHERE id = $1

            AND empresa_id = $2

            AND activo = TRUE

          LIMIT 1
          `,
          [
            productoId,
            empresaId
          ]
        );


      if (
        productoResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          message:
            `Producto ${productoId} no existe o está inactivo`
        });

      }


      const producto =
        productoResult.rows[0];


      const precioUnitario =
        Number(
          producto.precio || 0
        );


      const subtotal =
        precioUnitario *
        cantidadVendida;


      totalVenta +=
        subtotal;


      /*
         Guardamos el detalle para insertarlo
         posteriormente en detalle_pedido.
      */

      detallesVenta.push({

        producto_venta_id:
          productoId,

        producto:
          producto.nombre,

        cantidad:
          cantidadVendida,

        precio_unitario:
          precioUnitario,

        subtotal:
          subtotal

      });



      /* ===================================================
         3. BUSCAR RECETA DEL PRODUCTO
      =================================================== */

      const recetaCabeceraResult =
        await client.query(
          `
          SELECT
            id

          FROM public.recetas

          WHERE empresa_id = $1
            AND menu_id = $2
            AND activo = TRUE

          ORDER BY id

          LIMIT 1
          `,
          [
            empresaId,
            productoId
          ]
        );


      if (
        recetaCabeceraResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          message:
            `El producto ${producto.nombre} no tiene receta creada`
        });

      }


      const recetaId =
        Number(
          recetaCabeceraResult.rows[0].id
        );



      /* ===================================================
         4. BUSCAR INGREDIENTES DE LA RECETA
      =================================================== */

      const recetaResult =
        await client.query(
          `
          SELECT

            rd.tipo_porcion_id,

            rd.cantidad_necesaria,

            tp.id_materia_prima,

            tp.gramos,

            mp.nombre
              AS ingrediente

          FROM public.receta_detalle rd

          INNER JOIN public.tipo_porcion tp

            ON tp.id =
               rd.tipo_porcion_id

          INNER JOIN public.materias_primas mp

            ON mp.id =
               tp.id_materia_prima

          WHERE rd.receta_id = $1

            AND mp.empresa_id = $2

            AND (
              tp.empresa_id = $2
              OR tp.empresa_id IS NULL
            )

          ORDER BY rd.id
          `,
          [
            recetaId,
            empresaId
          ]
        );


      if (
        recetaResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          message:
            `El producto ${producto.nombre} no tiene ingredientes`
        });

      }



      /* ===================================================
         5. ACUMULAR INGREDIENTES NECESARIOS
      =================================================== */

      for (
        const receta
        of recetaResult.rows
      ) {

        const materiaPrimaId =
          Number(
            receta.id_materia_prima
          );


        const gramos =
          Number(
            receta.gramos
          );


        /*
           cantidad_necesaria normalmente será:

           1
           2
           etc.

           Representa cuántas porciones necesita
           cada unidad del producto vendido.
        */

        const cantidadPorProducto =
          Number(
            receta.cantidad_necesaria
          );


        const cantidadNecesaria =
          cantidadPorProducto *
          cantidadVendida;


        /*
           Identificamos físicamente la porción
           mediante:

           materia prima + gramos
        */

        const clave =
          `${materiaPrimaId}:${gramos}`;


        if (
          ingredientesNecesarios.has(
            clave
          )
        ) {

          const existente =
            ingredientesNecesarios.get(
              clave
            );


          existente.cantidad +=
            cantidadNecesaria;

        } else {

          ingredientesNecesarios.set(
            clave,
            {

              materia_prima_id:
                materiaPrimaId,

              tipo_porcion_id:
                Number(
                  receta.tipo_porcion_id
                ),

              ingrediente:
                receta.ingrediente,

              gramos:
                gramos,

              cantidad:
                cantidadNecesaria

            }
          );

        }

      }

    }



    /* =====================================================
       6. VALIDAR STOCK DE COCINA
    ===================================================== */

    /*
       Antes de registrar la venta comprobamos
       TODO el stock.

       Si falta un ingrediente, no se registra
       ninguna parte de la venta.
    */

    const stocksBloqueados =
      [];


    for (
      const ingredienteNecesario
      of ingredientesNecesarios.values()
    ) {

      /*
         Cocina física está representada por:

         public.porciones
      */

      const stockResult =
        await client.query(
          `
          SELECT

            id,

            nombre,

            proteina,

            gramos,

            costo_unidad,

            unidades_disponibles,

            stock_minimo

          FROM public.porciones

          WHERE empresa_id = $1

            AND LOWER(TRIM(proteina))
                =
                LOWER(TRIM($2))

            AND gramos = $3

          ORDER BY id

          LIMIT 1

          FOR UPDATE
          `,
          [
            empresaId,
            ingredienteNecesario
              .ingrediente,
            ingredienteNecesario
              .gramos
          ]
        );


      if (
        stockResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          message:
            `No existe stock en Cocina para ` +
            `${ingredienteNecesario.ingrediente} ` +
            `${ingredienteNecesario.gramos} g`
        });

      }


      const stock =
        stockResult.rows[0];


      const disponible =
        Number(
          stock.unidades_disponibles ||
          0
        );


      const necesario =
        Number(
          ingredienteNecesario.cantidad
        );


      if (
        disponible <
        necesario
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({

          message:
            `Stock insuficiente: ` +
            `${ingredienteNecesario.ingrediente}. ` +
            `Disponible: ${disponible}, ` +
            `necesario: ${necesario}`

        });

      }


      /*
         Guardamos el ID exacto de porciones
         para descontarlo después.
      */

      stocksBloqueados.push({

        porcion_id:
          Number(stock.id),

        ingrediente:
          ingredienteNecesario
            .ingrediente,

        gramos:
          ingredienteNecesario
            .gramos,

        cantidad:
          necesario

      });

    }



    /* =====================================================
       7. CREAR PEDIDO / VENTA
    ===================================================== */

    /*
       CCC completo utiliza pedidos.

       CCC-Básico registra la venta directamente
       como un pedido terminado.

       Por ahora NO modificamos el precio calculando
       IVA automáticamente.

       Conservamos el comportamiento anterior:

       subtotal = totalVenta
       iva      = 0
       total    = totalVenta

       Así no introducimos una nueva regla comercial
       mientras estamos migrando el modelo.
    */

    const ventaResult =
      await client.query(
        `
        INSERT INTO public.pedidos
        (
          canal,
          estado,
          usuario_id,
          subtotal,
          iva,
          total,
          metodo_pago,
          observacion,
          cerrado_en,
          empresa_id
        )

        VALUES
        (
          'MOSTRADOR',
          'CERRADO',
          $1,
          $2,
          0,
          $2,
          $3,
          'Venta registrada desde CCC Básico',
          CURRENT_TIMESTAMP,
          $4
        )

        RETURNING
          id,
          creado_en,
          cerrado_en,
          total,
          metodo_pago,
          usuario_id,
          empresa_id
        `,
        [
          req.user.id,
          totalVenta,
          medioPagoNormalizado,
          empresaId
        ]
      );


    const pedido =
      ventaResult.rows[0];



    /* =====================================================
       8. INSERTAR DETALLE DE LA VENTA
    ===================================================== */

    for (
      const detalle
      of detallesVenta
    ) {

      await client.query(
        `
        INSERT INTO public.detalle_pedido
        (
          pedido_id,
          menu_id,
          cantidad,
          precio_unitario,
          subtotal
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5
        )
        `,
        [
          pedido.id,
          detalle.producto_venta_id,
          detalle.cantidad,
          detalle.precio_unitario,
          detalle.subtotal
        ]
      );

    }



    /* =====================================================
       9. DESCONTAR STOCK DE COCINA
    ===================================================== */

    /*
       public.porciones no necesita disminuir
       un costo_total.

       El costo unitario de la porción permanece.

       Solamente disminuyen las unidades disponibles.
    */

    for (
      const stock
      of stocksBloqueados
    ) {

      await client.query(
        `
        UPDATE public.porciones

        SET

          unidades_disponibles =
            GREATEST(
              unidades_disponibles - $1,
              0
            )

        WHERE id = $2
          AND empresa_id = $3
        `,
        [
          stock.cantidad,
          stock.porcion_id,
          empresaId
        ]
      );

    }



    /* =====================================================
       10. CONFIRMAR TODO
    ===================================================== */

    await client.query(
      'COMMIT'
    );



    /* =====================================================
       RESPUESTA COMPATIBLE CON CCC-BÁSICO
    ===================================================== */

    return res
      .status(201)
      .json({

        message:
          'Venta registrada e inventario descontado correctamente',

        venta: {

          id:
            Number(pedido.id),

          fecha:
            pedido.cerrado_en ||
            pedido.creado_en,

          total:
            Number(pedido.total),

          medio_pago:
            pedido.metodo_pago,

          usuario_id:
            Number(pedido.usuario_id),

          empresa_id:
            Number(pedido.empresa_id)

        },

        detalles:
          detallesVenta

      });


  } catch (error) {

    /*
       Si ocurre cualquier error:

       - no queda pedido parcial
       - no queda detalle parcial
       - no se descuenta inventario

       PostgreSQL revierte toda la operación.
    */

    await client.query(
      'ROLLBACK'
    );


    console.error(
      'Error crearVenta:',
      error
    );


    return res.status(500).json({

      message:
        'Error al registrar venta',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}



/* =========================================================
   EXPORTAR CONTROLADORES
========================================================= */

module.exports = {

  ventasHoy,

  crearVenta

};