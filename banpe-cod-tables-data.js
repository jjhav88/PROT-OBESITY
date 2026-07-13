/**
 * Tablas de puntuación codificada BANPE (columnas 1–5 por banda de edad).
 * Fuente: Tabla de puntuaciones codificadas (manual / Excel).
 */
window.BANPE_COD_TABLES_ROWS = [
    {
        key: 'len_exp_conv',
        label: 'Conversación (Total)',
        bands: [
            ['', '0-2', '3-6', '7', '>8'],
            ['0-2', '3-6', '7-11', '12', '>13'],
            ['0-1', '2-5', '6-10', '11-12', '>13']
        ]
    },
    {
        key: 'len_exp_fluidez',
        label: 'Fluidez verbal (Aciertos)',
        bands: [
            ['', '0', '1-3', '4', '>5'],
            ['0-1', '2-4', '5-7', '8', '>9'],
            ['0-1', '2-5', '6-9', '10', '>11']
        ]
    },
    {
        key: 'inh_stroop_dn_t',
        label: 'Stroop Día-Noche (Tiempo)',
        bands: [
            ['>115', '92-114', '69-91', '62-68', '1-61'],
            ['>101', '81-100', '61-80', '54-60', '1-53'],
            ['>84', '68-83', '52-67', '47-61', '1-46']
        ]
    },
    {
        key: 'flex_cat_b_err',
        label: 'Categorización B. Errores',
        bands: [
            ['>8', '6-7', '4-5', '3', '0-2'],
            ['>11', '8-10', '6-7', '5', '0-4'],
            ['>10', '8-9', '5-7', '', '0-4']
        ]
    },
    {
        key: 'flex_cat_b_pers',
        label: 'Categorización B. Perseveraciones',
        bands: [
            ['>10', '8-9', '6', '5', '0-4'],
            ['>9', '7-8', '5-6', '4', '0-3'],
            ['>9', '7-8', '4-6', '3', '0-2']
        ]
    },
    {
        key: 'flex_cat_b_pers_crit',
        label: 'Categorización B. Perseveraciones de criterios',
        bands: [
            ['>8', '6-7', '5', '3-4', '0-2'],
            ['>7', '6', '4-5', '3', '0-2'],
            ['>8', '6-7', '4-5', '2-3', '0-1']
        ]
    },
    {
        key: 'flex_cat_b_err_man',
        label: 'Categorización B. Errores de mantenimiento',
        bands: [
            ['>4', '3', '', '2', '0-1'],
            ['>6', '4-5', '2-3', '1', '0'],
            ['>4', '3', '2', '1', '0']
        ]
    },
    {
        key: 'inh_lab_err',
        label: 'Laberinto. Errores atravesar',
        bands: [
            ['>7', '5-6', '3-4', '2', '0-1'],
            ['>5', '3-4', '2', '1', '0'],
            ['>4', '3', '2', '1', '0']
        ]
    },
    {
        key: 'plan_lab_err',
        label: 'Laberintos. Errores camino sin salida',
        bands: [
            ['>6', '4-5', '3', '2', '0-1'],
            ['>8', '6-7', '3-5', '2', '0-1'],
            ['>8', '6-7', '4-5', '3', '0-2']
        ]
    },
    {
        key: 'inh_demora_err',
        label: 'Demora de gratificación. Total errores voltear',
        bands: [
            ['>7', '5-6', '3-4', '2', '0-1'],
            ['>4', '3', '2', '1', '0'],
            ['>4', '3', '2', '1', '0']
        ]
    },
    {
        key: 'ryb_juego',
        label: 'Prueba de Juego. Puntuación total',
        bands: [
            ['0', '1', '2-5', '6-7', '>8'],
            ['0', '1', '2-5', '6-7', '>8'],
            ['0', '1', '2-6', '7-8', '>9']
        ]
    }
];
