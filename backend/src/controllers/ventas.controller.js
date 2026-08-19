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
       1. LISTAR VENTAS DE HOY
    ===================================================== */

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
              )::date =
              (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'America/Santiago'
              )::date

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
       2. DETALLE DE LAS VENTAS DE HOY
    ===================================================== */

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
              )::date =
              (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'America/Santiago'
              )::date

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
       3. TOTALES: DÍA, SEMANA, MES Y AÑO

       PostgreSQL considera el inicio de la semana en lunes.
       Todas las comparaciones usan la fecha local de Santiago.
    ===================================================== */

    const totalesResult = await pool.query(
      `
        SELECT

          COALESCE(
            SUM(p.total) FILTER (
              WHERE COALESCE(
                      p.cerrado_en,
                      p.creado_en
                    )::date =
                    (
                      CURRENT_TIMESTAMP
                      AT TIME ZONE 'America/Santiago'
                    )::date
            ),
            0
          ) AS total_dia,

          COALESCE(
            SUM(p.total) FILTER (
              WHERE COALESCE(
                      p.cerrado_en,
                      p.creado_en
                    )::date >=
                    DATE_TRUNC(
                      'week',
                      CURRENT_TIMESTAMP
                      AT TIME ZONE 'America/Santiago'
                    )::date

                AND COALESCE(
                      p.cerrado_en,
                      p.creado_en
                    )::date <
                    (
                      DATE_TRUNC(
                        'week',
                        CURRENT_TIMESTAMP
                        AT TIME ZONE 'America/Santiago'
                      )
                      + INTERVAL '1 week'
                    )::date
            ),
            0
          ) AS total_semana,

          COALESCE(
            SUM(p.total) FILTER (
              WHERE COALESCE(
                      p.cerrado_en,
                      p.creado_en
                    )::date >=
                    DATE_TRUNC(
                      'month',
                      CURRENT_TIMESTAMP
                      AT TIME ZONE 'America/Santiago'
                    )::date

                AND COALESCE(
                      p.cerrado_en,
                      p.creado_en
                    )::date <
                    (
                      DATE_TRUNC(
                        'month',
                        CURRENT_TIMESTAMP
                        AT TIME ZONE 'America/Santiago'
                      )
                      + INTERVAL '1 month'
                    )::date
            ),
            0
          ) AS total_mes,

          COALESCE(
            SUM(p.total) FILTER (
              WHERE COALESCE(
                      p.cerrado_en,
                      p.creado_en
                    )::date >=
                    DATE_TRUNC(
                      'year',
                      CURRENT_TIMESTAMP
                      AT TIME ZONE 'America/Santiago'
                    )::date

                AND COALESCE(
                      p.cerrado_en,
                      p.creado_en
                    )::date <
                    (
                      DATE_TRUNC(
                        'year',
                        CURRENT_TIMESTAMP
                        AT TIME ZONE 'America/Santiago'
                      )
                      + INTERVAL '1 year'
                    )::date
            ),
            0
          ) AS total_anio

        FROM public.pedidos p

        WHERE p.empresa_id = $1

          AND (
            p.cerrado_en IS NOT NULL
            OR UPPER(COALESCE(p.estado, '')) IN (
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
       4. COSTO DE VENTA

       Se obtiene el costo de cada producto desde su receta:

       receta_detalle
          -> tipo_porcion
          -> materias_primas
          -> porciones.costo_unidad

       Para cada producto usamos la primera receta activa,
       igual que crearVenta().
    ===================================================== */

    const costosResult = await pool.query(
      `
        WITH receta_elegida AS (

          SELECT DISTINCT ON (r.menu_id)
            r.id,
            r.menu_id

          FROM public.recetas r

          WHERE r.empresa_id = $1
            AND r.activo = TRUE

          ORDER BY
            r.menu_id,
            r.id
        ),

        costo_menu AS (

          SELECT
            re.menu_id,

            COALESCE(
              SUM(
                rd.cantidad_necesaria
                * COALESCE(pc.costo_unidad, 0)
              ),
              0
            ) AS costo_unitario

          FROM receta_elegida re

          INNER JOIN public.receta_detalle rd
            ON rd.receta_id = re.id

          INNER JOIN public.tipo_porcion tp
            ON tp.id = rd.tipo_porcion_id

          INNER JOIN public.materias_primas mp
            ON mp.id = tp.id_materia_prima
           AND mp.empresa_id = $1

          LEFT JOIN LATERAL (

            SELECT
              p.costo_unidad

            FROM public.porciones p

            WHERE p.empresa_id = $1

              AND LOWER(TRIM(p.proteina)) =
                  LOWER(TRIM(mp.nombre))

              AND p.gramos = tp.gramos

            ORDER BY p.id DESC

            LIMIT 1

          ) pc ON TRUE

          GROUP BY re.menu_id
        ),

        lineas AS (

          SELECT
            COALESCE(
              p.cerrado_en,
              p.creado_en
            ) AS fecha,

            d.menu_id,
            d.cantidad,
            d.subtotal,

            COALESCE(
              cm.costo_unitario,
              0
            ) AS costo_unitario

          FROM public.detalle_pedido d

          INNER JOIN public.pedidos p
            ON p.id = d.pedido_id

          INNER JOIN public.menu m
            ON m.id = d.menu_id
           AND m.empresa_id = $1

          LEFT JOIN costo_menu cm
            ON cm.menu_id = d.menu_id

          WHERE p.empresa_id = $1

            AND (
              p.cerrado_en IS NOT NULL
              OR UPPER(COALESCE(p.estado, '')) IN (
                'CERRADO',
                'PAGADO',
                'COMPLETADO',
                'FINALIZADO'
              )
            )
        )

        SELECT

          COALESCE(
            SUM(
              cantidad * costo_unitario
            ) FILTER (
              WHERE fecha::date =
                    (
                      CURRENT_TIMESTAMP
                      AT TIME ZONE 'America/Santiago'
                    )::date
            ),
            0
          ) AS costo_dia,

          COALESCE(
            SUM(
              cantidad * costo_unitario
            ) FILTER (
              WHERE fecha::date >=
                    DATE_TRUNC(
                      'month',
                      CURRENT_TIMESTAMP
                      AT TIME ZONE 'America/Santiago'
                    )::date

                AND fecha::date <
                    (
                      DATE_TRUNC(
                        'month',
                        CURRENT_TIMESTAMP
                        AT TIME ZONE 'America/Santiago'
                      )
                      + INTERVAL '1 month'
                    )::date
            ),
            0
          ) AS costo_mes,

          EXTRACT(
            DAY FROM
            CURRENT_TIMESTAMP
            AT TIME ZONE 'America/Santiago'
          ) AS dias_transcurridos_mes

        FROM lineas
      `,
      [empresaId]
    );


    /* =====================================================
       5. RANKING DEL MES
       Más vendido -> menos vendido
    ===================================================== */

    const rankingResult = await pool.query(
      `
        WITH receta_elegida AS (

          SELECT DISTINCT ON (r.menu_id)
            r.id,
            r.menu_id

          FROM public.recetas r

          WHERE r.empresa_id = $1
            AND r.activo = TRUE

          ORDER BY
            r.menu_id,
            r.id
        ),

        costo_menu AS (

          SELECT
            re.menu_id,

            COALESCE(
              SUM(
                rd.cantidad_necesaria
                * COALESCE(pc.costo_unidad, 0)
              ),
              0
            ) AS costo_unitario

          FROM receta_elegida re

          INNER JOIN public.receta_detalle rd
            ON rd.receta_id = re.id

          INNER JOIN public.tipo_porcion tp
            ON tp.id = rd.tipo_porcion_id

          INNER JOIN public.materias_primas mp
            ON mp.id = tp.id_materia_prima
           AND mp.empresa_id = $1

          LEFT JOIN LATERAL (

            SELECT
              p.costo_unidad

            FROM public.porciones p

            WHERE p.empresa_id = $1

              AND LOWER(TRIM(p.proteina)) =
                  LOWER(TRIM(mp.nombre))

              AND p.gramos = tp.gramos

            ORDER BY p.id DESC

            LIMIT 1

          ) pc ON TRUE

          GROUP BY re.menu_id
        )

        SELECT
          m.id AS producto_id,
          m.nombre AS producto,

          COALESCE(
            SUM(d.cantidad),
            0
          ) AS cantidad,

          COALESCE(
            SUM(d.subtotal),
            0
          ) AS total_venta,

          COALESCE(
            SUM(
              d.cantidad
              * COALESCE(cm.costo_unitario, 0)
            ),
            0
          ) AS costo,

          COALESCE(
            SUM(d.subtotal),
            0
          )
          -
          COALESCE(
            SUM(
              d.cantidad
              * COALESCE(cm.costo_unitario, 0)
            ),
            0
          ) AS resultado_bruto

        FROM public.detalle_pedido d

        INNER JOIN public.pedidos p
          ON p.id = d.pedido_id

        INNER JOIN public.menu m
          ON m.id = d.menu_id
         AND m.empresa_id = $1

        LEFT JOIN costo_menu cm
          ON cm.menu_id = d.menu_id

        WHERE p.empresa_id = $1

          AND COALESCE(
                p.cerrado_en,
                p.creado_en
              )::date >=
              DATE_TRUNC(
                'month',
                CURRENT_TIMESTAMP
                AT TIME ZONE 'America/Santiago'
              )::date

          AND COALESCE(
                p.cerrado_en,
                p.creado_en
              )::date <
              (
                DATE_TRUNC(
                  'month',
                  CURRENT_TIMESTAMP
                  AT TIME ZONE 'America/Santiago'
                )
                + INTERVAL '1 month'
              )::date

          AND (
            p.cerrado_en IS NOT NULL
            OR UPPER(COALESCE(p.estado, '')) IN (
              'CERRADO',
              'PAGADO',
              'COMPLETADO',
              'FINALIZADO'
            )
          )

        GROUP BY
          m.id,
          m.nombre,
          cm.costo_unitario

        ORDER BY
          cantidad DESC,
          total_venta DESC,
          m.nombre ASC
      `,
      [empresaId]
    );


    /* =====================================================
       6. ARMAR RESPUESTA
    ===================================================== */

    const totales =
      totalesResult.rows[0] || {};


    const costos =
      costosResult.rows[0] || {};


    const totalDia =
      Number(
        totales.total_dia || 0
      );


    const totalSemana =
      Number(
        totales.total_semana || 0
      );


    const totalMes =
      Number(
        totales.total_mes || 0
      );


    const totalAnio =
      Number(
        totales.total_anio || 0
      );


    const costoDia =
      Number(
        costos.costo_dia || 0
      );


    const costoMes =
      Number(
        costos.costo_mes || 0
      );


    const diasTranscurridosMes =
      Math.max(
        Number(
          costos.dias_transcurridos_mes || 1
        ),
        1
      );


    const costoDiarioPromedio =
      costoMes /
      diasTranscurridosMes;


    const resultadoBrutoMes =
      totalMes -
      costoMes;


    const rankingMes =
      rankingResult.rows.map(
        item => ({

          producto_id:
            Number(item.producto_id),

          producto:
            item.producto,

          cantidad:
            Number(item.cantidad || 0),

          total_venta:
            Number(item.total_venta || 0),

          costo:
            Number(item.costo || 0),

          resultado_bruto:
            Number(
              item.resultado_bruto || 0
            )

        })
      );


    return res.json({

      total_dia:
        totalDia,

      total_semana:
        totalSemana,

      total_mes:
        totalMes,

      total_anio:
        totalAnio,

      costo_dia:
        costoDia,

      costo_mes:
        costoMes,

      costo_diario_promedio:
        costoDiarioPromedio,

      resultado_bruto_mes:
        resultadoBrutoMes,

      ranking_mes:
        rankingMes,

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
        'Error al listar ventas y estadísticas',

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
          CURRENT_TIMESTAMP AT TIME ZONE 'America/Santiago',
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