/**
 * BANPE — Aplicar Prueba
 * Formulario con orientaciones e indicaciones para el momento de aplicación.
 * Se divide en 3 secciones:
 *   1. Historia Clínica - BANPE
 *   2. Evaluación de Signos Neurológicos
 *   3. Protocolo de Aplicación
 *
 * Persistencia: los datos se guardan dentro del registro BANPE (/api/banpe/save)
 * mediante los hooks window.banpeApplyCollectData / window.banpeApplyLoadData,
 * que banpe.js invoca al guardar y al cargar un paciente.
 *
 * La lógica y los estilos viven en archivos separados (banpe-apply.js / banpe-apply.css)
 * para no sobrecargar banpe.js.
 */
(function () {
    'use strict';

    var MODAL_ID = 'banpeApplyModal';
    var escKeyHandler = null;
    var activeSection = 'historia';

    /* Estado persistente de todos los campos (clave -> valor). Sobrevive a cambios de pestaña. */
    var hcData = {};
    /* Expanders abiertos (por id). Todos cerrados por defecto. */
    var openExpanders = {};

    var SECTIONS = [
        { id: 'historia', label: 'Historia Clínica - BANPE' },
        { id: 'signos', label: 'Evaluación de Signos Neurológicos' },
        { id: 'protocolo', label: 'Protocolo de Aplicación' }
    ];

    /* Lista de países (nombres en español) para el campo Nacionalidad. */
    var COUNTRIES = [
        'México', 'Argentina', 'Bolivia', 'Brasil', 'Canadá', 'Chile', 'Colombia', 'Costa Rica',
        'Cuba', 'Ecuador', 'El Salvador', 'Estados Unidos', 'Guatemala', 'Haití', 'Honduras',
        'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'Puerto Rico', 'República Dominicana',
        'Uruguay', 'Venezuela', 'España', 'Portugal', 'Francia', 'Italia', 'Alemania', 'Reino Unido',
        'Irlanda', 'Países Bajos', 'Bélgica', 'Suiza', 'Austria', 'Suecia', 'Noruega', 'Dinamarca',
        'Finlandia', 'Polonia', 'Rusia', 'Ucrania', 'Grecia', 'Turquía', 'Rumania', 'Hungría',
        'República Checa', 'China', 'Japón', 'Corea del Sur', 'Corea del Norte', 'India', 'Pakistán',
        'Bangladés', 'Indonesia', 'Filipinas', 'Vietnam', 'Tailandia', 'Malasia', 'Singapur',
        'Arabia Saudita', 'Emiratos Árabes Unidos', 'Israel', 'Irán', 'Irak', 'Egipto', 'Marruecos',
        'Argelia', 'Túnez', 'Nigeria', 'Sudáfrica', 'Kenia', 'Etiopía', 'Ghana', 'Angola',
        'Australia', 'Nueva Zelanda', 'Belice', 'Jamaica', 'Trinidad y Tobago', 'Guyana', 'Surinam',
        'Otro'
    ];

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function val(key) {
        return hcData[key] != null ? String(hcData[key]) : '';
    }

    /* Rellena solo las claves vacías con los valores por defecto del paciente. */
    function prefillDefaults(defaults) {
        if (!defaults || typeof defaults !== 'object') return;
        Object.keys(defaults).forEach(function (k) {
            var current = hcData[k];
            if (current == null || String(current).trim() === '') {
                if (defaults[k] != null && String(defaults[k]).trim() !== '') {
                    hcData[k] = defaults[k];
                }
            }
        });
    }

    /* ---------- Helpers de campos ---------- */

    function textField(key, label, opts) {
        opts = opts || {};
        var type = opts.type || 'text';
        var ph = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '';
        return (
            '<div class="banpe-hc-field' + (opts.grow ? ' banpe-hc-field-grow' : '') + '">' +
            '<label for="hc_' + esc(key) + '">' + esc(label) + '</label>' +
            '<input type="' + esc(type) + '" id="hc_' + esc(key) + '" data-hc-key="' + esc(key) + '"' +
            ph + ' value="' + esc(val(key)) + '" />' +
            '</div>'
        );
    }

    function selectField(key, label, options) {
        var opts = (options || [])
            .map(function (o) {
                var sel = val(key) === o ? ' selected' : '';
                return '<option value="' + esc(o) + '"' + sel + '>' + esc(o) + '</option>';
            })
            .join('');
        var emptySel = val(key) === '' ? ' selected' : '';
        return (
            '<div class="banpe-hc-field">' +
            '<label for="hc_' + esc(key) + '">' + esc(label) + '</label>' +
            '<select id="hc_' + esc(key) + '" data-hc-key="' + esc(key) + '">' +
            '<option value=""' + emptySel + '>—</option>' +
            opts +
            '</select>' +
            '</div>'
        );
    }

    function textareaField(key, label, opts) {
        opts = opts || {};
        var ph = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '';
        return (
            '<div class="banpe-hc-field banpe-hc-field-full">' +
            '<label for="hc_' + esc(key) + '">' + esc(label) + '</label>' +
            '<textarea id="hc_' + esc(key) + '" data-hc-key="' + esc(key) + '" rows="' +
            (opts.rows || 3) + '"' + ph + '>' + esc(val(key)) + '</textarea>' +
            '</div>'
        );
    }

    function fieldRow(html) {
        return '<div class="banpe-hc-row">' + html + '</div>';
    }

    /* Radio Sí/No para una celda de tabla. */
    function radioCell(key, optValue) {
        var checked = val(key) === optValue ? ' checked' : '';
        return (
            '<input type="radio" name="' + esc(key) + '" data-hc-key="' + esc(key) + '" value="' +
            esc(optValue) + '"' + checked + ' />'
        );
    }

    function cellTextInput(key, opts) {
        opts = opts || {};
        var ph = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '';
        return (
            '<input type="text" class="banpe-hc-cell-input" id="hc_' + esc(key) + '" data-hc-key="' +
            esc(key) + '"' + ph + ' value="' + esc(val(key)) + '" />'
        );
    }

    /* ---------- Expander ---------- */

    function expander(id, title, innerHtml) {
        var open = !!openExpanders[id];
        return (
            '<div class="banpe-hc-expander' + (open ? ' open' : '') + '" data-expander="' + esc(id) + '">' +
            '<button type="button" class="banpe-hc-expander-head" data-expander-toggle="' + esc(id) + '">' +
            '<span>' + esc(title) + '</span>' +
            '<i class="fas fa-chevron-' + (open ? 'up' : 'down') + '"></i>' +
            '</button>' +
            '<div class="banpe-hc-expander-body"' + (open ? '' : ' style="display:none"') + '>' +
            innerHtml +
            '</div>' +
            '</div>'
        );
    }

    /* ---------- Sección Historia Clínica ---------- */

    function fichaIdentificacionHtml() {
        var lateralidad = ['Diestro', 'Zurdo', 'Ambidiestro', 'No definida'];
        var parentesco = ['Madre', 'Padre', 'Abuelo(a)', 'Tío(a)', 'Tutor legal', 'Otro'];
        return (
            fieldRow(textField('nombre_nino', 'Nombre del niño', { grow: true })) +
            fieldRow(
                textField('fecha_nacimiento', 'Fecha de nacimiento', { type: 'date' }) +
                textField('edad', 'Edad') +
                textField('fecha_consulta', 'Fecha de consulta', { type: 'date' })
            ) +
            fieldRow(
                textField('lugar_origen', 'Lugar de origen', { grow: true }) +
                selectField('nacionalidad', 'Nacionalidad', COUNTRIES)
            ) +
            fieldRow(
                textField('direccion', 'Dirección', { grow: true }) +
                selectField('lateralidad', 'Lateralidad', lateralidad)
            ) +
            fieldRow(textField('tutor_nombre', 'Nombre del padre o tutor responsable del menor', { grow: true })) +
            fieldRow(
                selectField('parentesco', 'Parentesco con el menor', parentesco) +
                textField('telefono', 'Teléfono', { type: 'tel' })
            ) +
            fieldRow(
                textareaField('motivo_consulta', 'Motivo de referencia o consulta para el menor', { rows: 3 })
            )
        );
    }

    function antecedentesHeredofamiliaresHtml() {
        var diseases = [
            { id: 'epilepsia', label: 'Epilepsia' },
            { id: 'paralisis_cerebral', label: 'Parálisis cerebral' },
            { id: 'demencias', label: 'Demencias' },
            { id: 'sindrome_down', label: 'Síndrome de Down' },
            { id: 'retraso_mental', label: 'Retraso mental' },
            { id: 'problemas_aprendizaje', label: 'Problemas de aprendizaje' },
            { id: 'problemas_lenguaje', label: 'Problemas de lenguaje' },
            { id: 'ansiedad', label: 'Ansiedad' },
            { id: 'tdah', label: 'TDAH' },
            { id: 'depresion', label: 'Depresión' },
            { id: 'trastorno_bipolar', label: 'Trastorno bipolar' },
            { id: 'esquizofrenia', label: 'Esquizofrenia' },
            { id: 'drogadiccion', label: 'Drogadicción' }
        ];
        var rows = diseases
            .map(function (d) {
                var key = 'hf_' + d.id;
                return (
                    '<tr>' +
                    '<td class="banpe-hc-td-label">' + esc(d.label) + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, 'Sí') + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, 'No') + '</td>' +
                    '<td>' + cellTextInput(key + '_parentesco') + '</td>' +
                    '</tr>'
                );
            })
            .join('');
        var otraKey = 'hf_otra';
        var otraRow =
            '<tr>' +
            '<td class="banpe-hc-td-label">Otra (describa): ' +
            cellTextInput(otraKey + '_desc', { placeholder: 'Especifique' }) +
            '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(otraKey, 'Sí') + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(otraKey, 'No') + '</td>' +
            '<td>' + cellTextInput(otraKey + '_parentesco') + '</td>' +
            '</tr>';
        return (
            '<p class="banpe-hc-instruction">Indique si alguno de los familiares directos del menor ' +
            '(padres, hermanos, tíos o abuelos) padece o padeció alguna de las siguientes enfermedades:</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table">' +
            '<thead><tr><th>Enfermedad</th><th>Sí</th><th>No</th><th>Parentesco</th></tr></thead>' +
            '<tbody>' + rows + otraRow + '</tbody>' +
            '</table>' +
            '</div>'
        );
    }

    function subHeading(text) {
        return '<h4 class="banpe-hc-subheading">' + esc(text) + '</h4>';
    }

    /* Grupo de opciones (radios) en línea para una sola pregunta. */
    function radioGroupField(key, label, options) {
        var opts = options
            .map(function (o) {
                return (
                    '<label class="banpe-hc-radio-opt">' +
                    radioCell(key, o) +
                    '<span>' + esc(o) + '</span>' +
                    '</label>'
                );
            })
            .join('');
        return (
            '<div class="banpe-hc-radio-group">' +
            '<span class="banpe-hc-radio-label">' + esc(label) + '</span>' +
            '<div class="banpe-hc-radio-opts">' + opts + '</div>' +
            '</div>'
        );
    }

    function antecedentesPrenatalesHtml() {
        var siNo = ['Sí', 'No'];
        return (
            subHeading('Las siguientes preguntas son respecto al embarazo:') +
            fieldRow(
                textField('pn_edad_madre', '¿Qué edad tenía la madre al momento del embarazo?') +
                textField('pn_numero_gesta', '¿Qué número de gesta fue?')
            ) +
            fieldRow(
                selectField('pn_hijo_planeado', 'El menor en consulta fue un hijo planeado', siNo) +
                selectField('pn_hijo_deseado', '¿Un hijo deseado?', siNo)
            ) +
            fieldRow(
                selectField('pn_cuidado_medico', '¿Recibió cuidado médico en el embarazo?', siNo) +
                textField('pn_cuidado_mes', '¿A partir de qué mes?')
            ) +
            subHeading('Durante el embarazo:') +
            fieldRow(
                textField('pn_madre_enfermedad', '¿La madre sufrió alguna enfermedad?', { grow: true }) +
                selectField('pn_recibio_medicamento', '¿Recibió medicamento?', siNo) +
                textField('pn_medicamento_cual', '¿Cuál?', { grow: true })
            ) +
            fieldRow(
                textField('pn_rubeola_varicela', '¿Tuvo rubéola, varicela o algún padecimiento similar?', { grow: true })
            ) +
            fieldRow(
                textField('pn_sustancia_toxica', '¿Estuvo expuesta a alguna sustancia tóxica?', { grow: true }) +
                textField('pn_sustancia_tiempo', '¿Por cuánto tiempo?', { grow: true })
            ) +
            fieldRow(
                textField('pn_alcohol_tabaco', '¿Consumía bebidas alcohólicas, tabaco u otra droga?', { grow: true }) +
                textField('pn_alcohol_frecuencia', 'Frecuencia', { grow: true })
            ) +
            fieldRow(
                textareaField('pn_caidas_golpes', '¿Tuvo caídas, golpes fuertes o algún acontecimiento que considere relevante?', { rows: 2 })
            ) +
            fieldRow(
                textareaField('pn_amenaza_aborto', '¿Presentó amenaza de aborto? (¿Cuál fue la razón?)', { rows: 2 })
            )
        );
    }

    function antecedentesPerinatalesHtml() {
        var alNacer = [
            { id: 'resucitacion', label: 'Necesitó maniobras de resucitación, oxígeno, incubadora' },
            { id: 'morado_amarillo', label: 'Se puso morado/amarillo' },
            { id: 'sufrimiento_fetal', label: 'Padeció sufrimiento fetal' }
        ];
        var alNacerRows = alNacer
            .map(function (r) {
                var key = 'pe_' + r.id;
                return (
                    '<tr>' +
                    '<td class="banpe-hc-td-label">' + esc(r.label) + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, 'Sí') + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, 'No') + '</td>' +
                    '<td>' + cellTextInput(key + '_especifique') + '</td>' +
                    '</tr>'
                );
            })
            .join('');
        return (
            subHeading('Condiciones del parto y nacimiento:') +
            fieldRow(textField('pe_semanas_gestacion', '¿Cuántas semanas duró la gestación?', { grow: true })) +
            fieldRow(
                selectField('pe_parto_tipo', 'El parto fue', ['Natural', 'Cesárea']) +
                selectField('pe_parto_inicio', 'Y fue', ['Espontáneo', 'Inducido'])
            ) +
            fieldRow(
                selectField('pe_parto_lugar', 'Se realizó en', ['Hospital', 'Domicilio', 'Otro']) +
                textField('pe_parto_lugar_otro', 'Otro (especifique)', { grow: true }) +
                textField('pe_parto_duracion', '¿Cuánto duró?')
            ) +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table">' +
            '<thead><tr><th>Al nacer el niño:</th><th>Sí</th><th>No</th><th>Especifique</th></tr></thead>' +
            '<tbody>' + alNacerRows + '</tbody>' +
            '</table>' +
            '</div>' +
            fieldRow(
                textField('pe_peso', 'Peso (kg)') +
                textField('pe_talla', 'Talla (cm)') +
                textField('pe_apgar', 'APGAR (/9)')
            )
        );
    }

    function desarrolloRow(catCell, label, key) {
        return (
            '<tr>' +
            catCell +
            '<td class="banpe-hc-td-label">' + esc(label) + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, 'Sí') + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, 'No') + '</td>' +
            '<td>' + cellTextInput(key + '_rango') + '</td>' +
            '</tr>'
        );
    }

    function esfinterField(label, key) {
        return (
            '<span class="banpe-hc-esf-item">' +
            '<label for="hc_' + esc(key) + '">' + esc(label) + ':</label>' +
            '<input type="text" id="hc_' + esc(key) + '" data-hc-key="' + esc(key) +
            '" value="' + esc(val(key)) + '" />' +
            '</span>'
        );
    }

    function desarrolloPrimerosAniosHtml() {
        var motor = [
            { id: 'sostuvo_cabeza', label: 'Sostuvo la cabeza' },
            { id: 'sostuvo_tronco', label: 'Sostuvo el tronco' },
            { id: 'gateo', label: 'Gateó' },
            { id: 'se_puso_pie', label: 'Se puso de pie' },
            { id: 'camino', label: 'Caminó' }
        ];
        var lenguaje = [
            { id: 'balbuceo', label: 'Balbuceó' },
            { id: 'primera_palabra', label: 'Dijo su primera palabra' },
            { id: 'dos_palabras', label: 'Unió dos palabras' },
            { id: 'tres_palabras', label: 'Dijo tres palabras' },
            { id: 'frases', label: 'Construyó frases' }
        ];

        var motorRows = '';
        motor.forEach(function (m, i) {
            var cat = i === 0 ? '<td class="banpe-hc-cat" rowspan="6"><span>MOTOR</span></td>' : '';
            motorRows += desarrolloRow(cat, m.label, 'des_' + m.id);
        });
        var esfinterRow =
            '<tr><td class="banpe-hc-esf" colspan="4">' +
            '<div class="banpe-hc-esf-title">Controló esfínteres (anote el rango de edad en el que lo logró)</div>' +
            '<div class="banpe-hc-esf-grid">' +
            esfinterField('Vesical', 'des_esf_vesical') +
            esfinterField('Anal', 'des_esf_anal') +
            esfinterField('Diurno', 'des_esf_diurno') +
            esfinterField('Nocturno', 'des_esf_nocturno') +
            '</div></td></tr>';

        var lenguajeRows = '';
        lenguaje.forEach(function (l, i) {
            var cat = i === 0 ? '<td class="banpe-hc-cat" rowspan="5"><span>LENGUAJE</span></td>' : '';
            lenguajeRows += desarrolloRow(cat, l.label, 'des_' + l.id);
        });

        return (
            '<p class="banpe-hc-instruction">Por favor indique si el niño manifestó las siguientes ' +
            'características que son parte de su desarrollo y el rango de edad aproximado que tenía:</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-hc-table-dev">' +
            '<thead><tr><th></th><th>Característica</th><th>Sí</th><th>No</th><th>Rango de edad</th></tr></thead>' +
            '<tbody>' + motorRows + esfinterRow + lenguajeRows + '</tbody>' +
            '</table>' +
            '</div>'
        );
    }

    function medicamentoCard(num) {
        var p = 'hm_med' + num + '_';
        return (
            '<div class="banpe-hc-med-card">' +
            '<div class="banpe-hc-med-title">Medicamento ' + num + '</div>' +
            fieldRow(textField(p + 'nombre', 'Nombre ®', { grow: true })) +
            fieldRow(textField(p + 'sustancia', 'Sustancia activa', { grow: true })) +
            fieldRow(textField(p + 'grama', 'Gramaje') + textField(p + 'dosis', 'Dosis')) +
            fieldRow(textField(p + 'frecuencia', 'Frecuencia', { grow: true })) +
            '</div>'
        );
    }

    function historiaMedicaHtml() {
        var siNo = ['Sí', 'No'];
        return (
            fieldRow(
                selectField('hm_audicion_vista', '¿Ha presentado problemas de audición o vista?', siNo) +
                textField('hm_audicion_corregidos', '¿Han sido corregidos con algún aparato? (¿Cuál?)', { grow: true })
            ) +
            fieldRow(
                selectField('hm_alergia', '¿Tiene alguna alergia?', siNo) +
                textField('hm_alergia_cual', '¿Cuál?', { grow: true })
            ) +
            subHeading('Ha tenido alguna o más veces:') +
            fieldRow(
                selectField('hm_convulsiones', 'Convulsiones o crisis epilépticas', siNo) +
                textField('hm_convulsiones_edad', 'Edad') +
                textField('hm_convulsiones_frecuencia', 'Frecuencia', { grow: true })
            ) +
            fieldRow(
                selectField('hm_varicela', 'Varicela, viruela, sarampión', siNo) +
                textField('hm_varicela_edad', 'Edad') +
                textField('hm_varicela_frecuencia', 'Frecuencia', { grow: true })
            ) +
            fieldRow(
                selectField('hm_crisis_febriles', 'Crisis febriles', siNo) +
                textField('hm_crisis_febriles_edad', 'Edad') +
                textField('hm_crisis_febriles_frecuencia', 'Frecuencia', { grow: true })
            ) +
            fieldRow(
                selectField('hm_golpes_cabeza', 'Golpes en la cabeza que lo hayan hecho perder la conciencia', siNo) +
                textField('hm_golpes_edad', 'Edad') +
                textField('hm_golpes_tiempo', '¿Por cuánto tiempo perdió la conciencia?', { grow: true })
            ) +
            fieldRow(
                textField('hm_enf_infecto', '¿El menor tiene alguna enfermedad infectocontagiosa, neurológica o psiquiátrica? (¿Cuál?)', { grow: true }) +
                textField('hm_enf_infecto_edaddx', 'Edad de diagnóstico')
            ) +
            fieldRow(
                textField('hm_cirugias', '¿El menor ha sufrido cirugías o enfermedades que requieran hospitalización?', { grow: true })
            ) +
            fieldRow(
                textField('hm_cirugias_causas', '¿Cuáles fueron las causas?', { grow: true }) +
                textField('hm_cirugias_edad', 'Edad cuándo ocurrió')
            ) +
            subHeading('Farmacológico') +
            fieldRow(
                selectField('hm_toma_medicamento', '¿Actualmente el menor toma algún medicamento?', siNo) +
                textField('hm_medicamento_para_que', '¿Para qué lo(s) consume?', { grow: true })
            ) +
            '<div class="banpe-hc-med-grid">' +
            medicamentoCard(1) +
            medicamentoCard(2) +
            '</div>'
        );
    }

    function interaccionSocialHtml() {
        return (
            '<p class="banpe-hc-instruction">A continuación se sugieren algunas opciones de cómo se ' +
            'desenvuelve el niño socialmente; marque la que mejor coincida con el comportamiento del menor ' +
            'la mayor parte del tiempo.</p>' +
            radioGroupField('is_con_personas', 'Con las personas se muestra:', [
                'Normal',
                'Inquieto',
                'Retraído',
                'Irritante/molesto',
                'Desatento'
            ]) +
            radioGroupField('is_prefiere_jugar', 'Prefiere jugar con:', [
                'Niños de su edad',
                'Niños más grandes',
                'No le gusta jugar con niños'
            ]) +
            radioGroupField(
                'is_agrede',
                'Con frecuencia agrede física o verbalmente a otros niños sin razón aparente:',
                ['Sí', 'No']
            ) +
            radioGroupField('is_dificultad_amigos', '¿Tiene dificultad para hacer amigos o conservarlos?', [
                'Sí',
                'No'
            ])
        );
    }

    function interaccionFamiliarHtml() {
        var trato = ['Permisivo', 'Autoritario', 'Democrático', 'Indiferente'];
        var reprende = ['Verbalmente', 'Físicamente/golpes', 'No trata de reprenderle'];
        var siNo = ['Sí', 'No'];
        return (
            '<p class="banpe-hc-instruction">A continuación se sugieren algunas opciones de la dinámica en ' +
            'familia; marque la que mejor coincida con el comportamiento del menor la mayor parte del tiempo.</p>' +
            '<p class="banpe-hc-instruction"><strong>Cómo considera el trato que recibe el menor:</strong></p>' +
            subHeading('Con la madre:') +
            radioGroupField('if_madre_trato', 'Trato', trato) +
            radioGroupField('if_madre_reprende', 'Cómo reprende conductas indeseables', reprende) +
            subHeading('Con el padre:') +
            radioGroupField('if_padre_trato', 'Trato', trato) +
            radioGroupField('if_padre_reprende', 'Cómo reprende conductas indeseables', reprende) +
            subHeading('Cuidador / otro:') +
            fieldRow(textField('if_cuidador_parentesco', 'Cuidador / Parentesco', { grow: true })) +
            radioGroupField('if_cuidador_trato', 'Trato', trato) +
            radioGroupField('if_cuidador_reprende', 'Cómo reprende conductas indeseables', reprende) +
            radioGroupField(
                'if_actividades_recreativas',
                'En familia procuran actividades recreativas como: asistir a parques, practicar un deporte o hacer excursiones…',
                ['Frecuentemente', 'Casi nunca', 'Nunca']
            ) +
            subHeading('En el hogar') +
            fieldRow(
                selectField('if_lengua_diferente', '¿Se habla alguna lengua diferente a la del medio social o escolar?', siNo) +
                textField('if_lengua_cual', '¿Cuál?', { grow: true })
            ) +
            fieldRow(
                selectField('if_menor_practica', '¿El menor la practica?', siNo) +
                textField('if_personas_vive', '¿Con cuántas personas vive el niño?')
            ) +
            fieldRow(textField('if_quien_supervisa', '¿Quién le supervisa sus actividades?', { grow: true })) +
            '<p class="banpe-hc-radio-label">Cuenta con:</p>' +
            '<div class="banpe-hc-servicios">' +
            radioGroupField('if_servicio_luz', 'Luz', siNo) +
            radioGroupField('if_servicio_agua', 'Agua', siNo) +
            radioGroupField('if_servicio_drenaje', 'Drenaje', siNo) +
            radioGroupField('if_servicio_casa_propia', 'Casa propia', siNo) +
            '</div>'
        );
    }

    function comidaRow(label, key) {
        return (
            '<div class="banpe-hc-row banpe-hc-meal">' +
            '<div class="banpe-hc-meal-name">' + esc(label) + '</div>' +
            textField(key + '_hora', 'Hora') +
            textField(key + '_desc', 'Qué come', { grow: true }) +
            '</div>'
        );
    }

    function habitosHtml() {
        var siNo = ['Sí', 'No'];
        var frecuencia = ['Frecuentemente', 'Casi nunca', 'Nunca'];
        return (
            subHeading('Alimentación') +
            fieldRow(textField('hab_apetito', '¿Cómo considera su apetito actual?', { grow: true })) +
            radioGroupField(
                'hab_reactivo_comer',
                'Se muestra reactivo, agresivo o molesto cada vez que tiene que comer:',
                frecuencia
            ) +
            fieldRow(
                selectField('hab_preferencia_alimento', '¿Tiene alguna preferencia o desagrado marcado por algún alimento?', siNo) +
                textField('hab_preferencia_cual', '¿Cuál?', { grow: true })
            ) +
            fieldRow(
                selectField('hab_sustancias_no_comestibles', 'El menor prefiere ingerir sustancias no comestibles (jabón, tela, otros)', siNo) +
                textField('hab_sustancias_cuales', '¿Cuál(es)?', { grow: true })
            ) +
            fieldRow(textField('hab_alimentos_dia', '¿Cuántos alimentos toma al día?', { grow: true })) +
            '<p class="banpe-hc-radio-label">¿Qué come en cada alimento y en qué horario?</p>' +
            comidaRow('Desayuno', 'hab_desayuno') +
            comidaRow('Lunch/Almuerzo', 'hab_lunch') +
            comidaRow('Comida', 'hab_comida') +
            comidaRow('Colación', 'hab_colacion') +
            comidaRow('Cena', 'hab_cena') +
            comidaRow('Otro', 'hab_otro_comida') +
            subHeading('Sueño') +
            fieldRow(
                selectField('hab_higiene_sueno', '¿Tiene algún patrón de higiene de sueño?', siNo) +
                textField('hab_antes_dormir', '¿Qué hace(n) antes de dormir? Describa', { grow: true })
            ) +
            radioGroupField(
                'hab_dificultad_dormir',
                'Le toma alguna dificultad quedarse dormido cuando es tiempo:',
                frecuencia
            ) +
            fieldRow(
                selectField('hab_despertares_nocturnos', '¿Tiene despertares nocturnos, pesadillas o terrores nocturnos de manera frecuente?', siNo) +
                textField('hab_despertares_desc', 'Describa', { grow: true })
            ) +
            fieldRow(
                selectField('hab_cuesta_despertar', '¿Le cuesta trabajo despertar al menor por la mañana?', siNo) +
                textField('hab_cuesta_despertar_desc', 'Describa', { grow: true })
            ) +
            fieldRow(
                selectField('hab_somnoliento', '¿No descansa lo suficiente y lo percibe somnoliento durante el día?', siNo) +
                textField('hab_somnoliento_desc', 'Describa', { grow: true })
            ) +
            fieldRow(
                selectField('hab_siestas', '¿El menor realiza siestas durante el día?', siNo) +
                textField('hab_siestas_frecuencia', '¿Con qué frecuencia?', { grow: true })
            ) +
            subHeading('Escolares') +
            fieldRow(
                selectField('hab_asiste_escuela', '¿Asiste a la escuela o estancia infantil?', siNo) +
                textField('hab_no_asiste_porque', 'Si la respuesta es negativa, ¿por qué no?', { grow: true })
            ) +
            fieldRow(textField('hab_desempeno_escolar', '¿Cómo considera el desempeño y aprovechamiento escolar del menor?', { grow: true })) +
            fieldRow(textField('hab_relacion_profesor', '¿Cómo es la relación con su profesor(a)?', { grow: true })) +
            fieldRow(textField('hab_comporta_ninos', '¿Cómo se comporta con los demás niños de su edad?', { grow: true })) +
            fieldRow(
                selectField('hab_maestros_problema', '¿Los maestros han informado de algún problema (hiperactividad, falta de concentración, mal seguimiento de instrucciones o si es retraído)?', siNo) +
                textField('hab_maestros_problema_desc', 'Describa', { grow: true })
            )
        );
    }

    function antecedentesAcademicosHtml() {
        var siNo = ['Sí', 'No'];
        return (
            subHeading('Guardería') +
            fieldRow(
                textField('aca_guarderia_edad', '¿A qué edad ingresó?') +
                textField('aca_guarderia_quejas', '¿Los maestros refirieron quejas? ¿De qué tipo? Describa', { grow: true })
            ) +
            subHeading('Preescolar') +
            fieldRow(
                textField('aca_preescolar_edad', '¿A qué edad ingresó?') +
                textField('aca_preescolar_quejas', '¿Los maestros refirieron quejas? ¿De qué tipo? Describa', { grow: true })
            ) +
            fieldRow(textField('aca_tarea_dificultad', '¿Al hacer la tarea muestra alguna dificultad (falta de interés, de atención o problemas de aprendizaje)?', { grow: true })) +
            fieldRow(textField('aca_dificultad_frecuente', '¿Cuáles son las que ha observado con más frecuencia?', { grow: true })) +
            fieldRow(textField('aca_actividades_menos', '¿Cuáles son las actividades menos placenteras para el niño?', { grow: true })) +
            fieldRow(
                selectField('aca_hora_tarea', '¿Tiene una hora específica para hacer sus tareas escolares?', siNo) +
                textField('aca_hora_cual', 'Si sí, ¿cuál?', { grow: true }) +
                textField('aca_hora_porque', 'Si no, ¿por qué razón?', { grow: true })
            ) +
            fieldRow(textField('aca_apoyo_dudas', '¿Alguien le apoya en las dudas que puedan surgir de las tareas?', { grow: true })) +
            fieldRow(textField('aca_habitos_estudio', '¿Considera que se le han inculcado hábitos de estudio al menor? Describa', { grow: true }))
        );
    }

    function antecedentesPadecimientoHtml() {
        return (
            subHeading('Principio y evolución:') +
            fieldRow(textareaField('pad_inicio_quejas', '¿Cómo iniciaron las quejas y hace cuánto? Describa', { rows: 4 })) +
            fieldRow(
                textareaField(
                    'pad_atencion_recibida',
                    '¿Ha recibido atención médica, pedagógica, psicológica, neuropsicológica u otra? Describa (anote fechas)',
                    { rows: 4 }
                )
            )
        );
    }

    function sectionHistoriaHtml() {
        return (
            '<div class="banpe-sn-header">' +
            '<span class="banpe-sn-badge">BANPE</span>' +
            '<div class="banpe-sn-titles">' +
            '<h2>HISTORIA CLÍNICA</h2>' +
            '<p class="banpe-sn-subtitle">Batería de Evaluación Neuropsicológica para Preescolares</p>' +
            '</div>' +
            '</div>' +
            expander('ficha_identificacion', 'I. Ficha de identificación y motivo de consulta', fichaIdentificacionHtml()) +
            expander('antecedentes_heredofamiliares', 'II. Antecedentes heredofamiliares', antecedentesHeredofamiliaresHtml()) +
            expander('antecedentes_prenatales', 'III. Antecedentes prenatales', antecedentesPrenatalesHtml()) +
            expander('antecedentes_perinatales', 'IV. Antecedentes perinatales', antecedentesPerinatalesHtml()) +
            expander('desarrollo_primeros_anios', 'V. Desarrollo de los primeros años de vida', desarrolloPrimerosAniosHtml()) +
            expander('historia_medica', 'VI. Historia médica', historiaMedicaHtml()) +
            expander('interaccion_social', 'VII. Interacción social', interaccionSocialHtml()) +
            expander('interaccion_familiar', 'VIII. Interacción familiar', interaccionFamiliarHtml()) +
            expander('habitos', 'IX. Hábitos', habitosHtml()) +
            expander('antecedentes_academicos', 'X. Antecedentes académicos', antecedentesAcademicosHtml()) +
            expander('antecedentes_padecimiento', 'XI. Antecedentes del padecimiento actual', antecedentesPadecimientoHtml())
        );
    }

    /* ---------- Secciones pendientes ---------- */

    /* ---------- Signos neurológicos: SB derivado ---------- */

    var SN_TONO_KEYS = ['sn_7a', 'sn_7b', 'sn_7c', 'sn_7d', 'sn_8a', 'sn_8b'];

    function syncSnSb(reactivoKey) {
        var checked = hcData[reactivoKey] === '0';
        var cb = document.getElementById('hc_' + reactivoKey + '_sb');
        if (cb) cb.checked = checked;
    }

    function syncSnTonoSb() {
        var noCount = SN_TONO_KEYS.filter(function (k) {
            return hcData[k] === 'No';
        }).length;
        var cb = document.getElementById('hc_sn_tono_sb');
        if (cb) cb.checked = noCount >= 4;
    }

    function snOption(key, value, text) {
        return (
            '<label class="banpe-sn-opt">' +
            '<input type="radio" name="' + esc(key) + '" data-hc-key="' + esc(key) + '" value="' +
            esc(value) + '"' + (val(key) === value ? ' checked' : '') + ' />' +
            '<span>' + esc(text) + '</span>' +
            '</label>'
        );
    }

    function snSbCell(itemId) {
        var checked = val('sn_' + itemId) === '0';
        return (
            '<div class="banpe-sn-sb-cell">' +
            '<span class="banpe-sn-sb-label">SB</span>' +
            '<input type="checkbox" id="hc_sn_' + esc(itemId) + '_sb" class="banpe-sn-sb-check" disabled' +
            (checked ? ' checked' : '') + ' />' +
            '</div>'
        );
    }

    function snNumericItem(item) {
        var key = 'sn_' + item.id;
        return (
            '<div class="banpe-sn-item">' +
            '<div class="banpe-sn-item-head">' +
            '<div class="banpe-sn-item-desc"><strong>' + esc(item.id) + '.</strong> ' + esc(item.desc) + '</div>' +
            snSbCell(item.id) +
            '</div>' +
            '<div class="banpe-sn-options">' +
            snOption(key, '0', '0 = ' + item.opts[0]) +
            snOption(key, '1', '1 = ' + item.opts[1]) +
            snOption(key, '2', '2 = ' + item.opts[2]) +
            '</div>' +
            '</div>'
        );
    }

    function snTonoTableHtml() {
        var sup = [
            { id: '7a', label: 'a) Agitar la mano mientras se sostiene el antebrazo' },
            { id: '7b', label: 'b) Flexión plantar y dorsal de la muñeca' },
            { id: '7c', label: 'c) Flexionar y extender el codo' },
            { id: '7d', label: 'd) Flexión dorsal de la muñeca y de los dedos' }
        ];
        var inf = [
            { id: '8a', label: 'a) Sostener el muslo por encima de la rodilla con la pierna colgando hacia abajo y girar la pierna' },
            { id: '8b', label: 'b) Rango de movimiento del tobillo' }
        ];
        function tonoRow(r) {
            var key = 'sn_' + r.id;
            return (
                '<tr>' +
                '<td class="banpe-hc-td-label">' + esc(r.label) + '</td>' +
                '<td class="banpe-hc-td-opt">' + radioCell(key, 'No') + '</td>' +
                '<td class="banpe-hc-td-opt">' + radioCell(key, 'Sí') + '</td>' +
                '</tr>'
            );
        }
        var tonoChecked = SN_TONO_KEYS.filter(function (k) {
            return hcData[k] === 'No';
        }).length >= 4;
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-sn-tono-table">' +
            '<thead><tr><th></th><th>No</th><th>Sí</th></tr></thead>' +
            '<tbody>' +
            '<tr><td class="banpe-sn-grouprow" colspan="3">7. Tono en las extremidades superiores. Lo hace:</td></tr>' +
            sup.map(tonoRow).join('') +
            '<tr><td class="banpe-sn-grouprow" colspan="3">8. Tono en las extremidades inferiores:</td></tr>' +
            inf.map(tonoRow).join('') +
            '</tbody>' +
            '</table>' +
            '</div>' +
            '<p class="banpe-sn-area-note">** Se considera hipotonía e hipertonía la presencia de cuatro “NO” en el ' +
            'rubro de tono muscular. Se coloca ✓ automáticamente si hay cuatro “NO”.</p>' +
            '<div class="banpe-sn-tono-sb">' +
            '<span class="banpe-sn-sb-label">SB (cuatro “NO”)</span>' +
            '<input type="checkbox" id="hc_sn_tono_sb" class="banpe-sn-sb-check" disabled' +
            (tonoChecked ? ' checked' : '') + ' />' +
            '</div>'
        );
    }

    function signosFormHtml() {
        var areas = [
            {
                area: 'I. Lenguaje',
                note: 'Evalúe el lenguaje mediante el establecimiento de una conversación informal.',
                items: [
                    {
                        id: '1',
                        desc: 'Grado de claridad de la pronunciación',
                        opts: [
                            'No tiene claridad en pronunciación',
                            'Se percibe cierto grado de claridad en pronunciación',
                            'Se percibe un buen grado de claridad en pronunciación'
                        ]
                    },
                    {
                        id: '2',
                        desc: 'Grado de coherencia en el contenido',
                        opts: [
                            'No tiene coherencia en contenido',
                            'Se percibe cierto grado de coherencia',
                            'Se percibe un buen grado de coherencia en contenido'
                        ]
                    }
                ]
            },
            {
                area: 'II. Equilibrio',
                items: [
                    {
                        id: '3',
                        desc: 'De pie: se le pide al niño que se mantenga durante 30 segundos con los ojos cerrados, los pies juntos y las manos y dedos extendidos',
                        opts: [
                            'Realiza más de tres movimientos del cuerpo durante el tiempo solicitado',
                            'Realiza menos de tres movimientos del cuerpo durante el tiempo solicitado',
                            'No realiza ningún tipo de movimiento del cuerpo durante el tiempo solicitado'
                        ]
                    },
                    {
                        id: '4',
                        desc: 'Salto: se le pide al niño que salte 10 veces consecutivas en cada pie',
                        opts: [
                            'No salta por lo menos cinco veces consecutivas',
                            'Salta más de cinco veces consecutivas pero menos de 10',
                            'Salta 10 veces consecutivas'
                        ]
                    },
                    {
                        id: '5',
                        desc: '“Marcha tándem” en una línea: caminar sobre una línea poniendo un pie directamente enfrente del otro, con las manos junto a sus piernas. Se considera falla no poder lograr la marcha en al menos cinco ocasiones consecutivas',
                        opts: [
                            'No logra la marcha por lo menos cinco veces consecutivas',
                            'Logra marcha con dificultades en equilibrio',
                            'Logra la “marcha tándem”'
                        ]
                    }
                ]
            },
            {
                area: 'III. Coordinación',
                items: [
                    {
                        id: '6',
                        desc: 'Dedo-nariz: extiende cada brazo lateralmente y luego, flexionándolo hacia su rostro, toca con su dedo índice su nariz, durante cinco ocasiones con ojos abiertos; luego repite con ojos cerrados. Falla si no logra repetir la secuencia al menos tres veces',
                        opts: [
                            'No logra completar la secuencia al menos tres veces',
                            'Logra la secuencia sólo con los ojos abiertos',
                            'Logra la secuencia adecuadamente con ojos abiertos y cerrados'
                        ]
                    }
                ]
            },
            { area: 'IV. Tono muscular', tono: true },
            {
                area: 'V. Secuencias alternas',
                items: [
                    {
                        id: '9',
                        desc: 'El examinador presenta el modelo y el niño debe repetirlo: cerrar una mano en puño y extender la otra; luego, simultáneamente, extender la mano cerrada y empuñar la otra. La secuencia se repite varias veces (4)',
                        opts: [
                            'Ejecución diferente a la del examinador',
                            'Movimiento lento, difícil, desautomatizado, retrasado',
                            'Ejecución igual a la del examinador'
                        ]
                    }
                ]
            },
            {
                area: 'VI. Marcha',
                items: [
                    {
                        id: '10',
                        desc: 'Se le pide al niño que camine hacia atrás una distancia de 5 m',
                        opts: [
                            'No logra la marcha en por lo menos 3 m',
                            'La marcha es torpe y usa la vista para orientarse',
                            'Logra la secuencia adecuadamente con ojos abiertos y cerrados'
                        ]
                    }
                ]
            },
            {
                area: 'VII. Secuencias dedo-pulgar',
                items: [
                    {
                        id: '11',
                        desc: 'Imita la secuencia del evaluador: el pulgar toca todos los dedos en el orden índice, medio, anular, meñique-anular, medio, índice. (Se realiza con ambas manos)',
                        opts: [
                            'No logra la secuencia al menos dos veces',
                            'Lo logra de manera muy torpe',
                            'Logra la secuencia sin dificultad'
                        ]
                    }
                ]
            },
            {
                area: 'VIII. Grafestesia',
                items: [
                    {
                        id: '12',
                        desc: 'Con ojos cerrados y manos extendidas en posición vertical, con la punta de una pluma se dibuja un círculo, cuadro y triángulo y se le pide al niño que nombre cuáles son',
                        opts: [
                            'Se presentan al menos dos fallas en cada mano',
                            'No reconoce algún símbolo en alguna de las manos',
                            'Logra identificar la mayoría de los símbolos presentados en ambas manos'
                        ]
                    }
                ]
            },
            {
                area: 'IX. Asteroagnosia',
                items: [
                    {
                        id: '13',
                        desc: 'Con ojos cerrados, identifica un peine, una llave y una moneda. Se permite la manipulación pero no la transferencia a la otra mano',
                        opts: [
                            'No reconoce los tres elementos con cada mano',
                            'No reconoce dos o menos objetos en alguna mano',
                            'Reconoce la mayoría o más de dos objetos en ambas manos'
                        ]
                    }
                ]
            },
            {
                area: 'X. Signos coreiformes',
                items: [
                    {
                        id: '14',
                        desc: 'De pie, se observa por pequeños bloques la presencia de espasmos en los dedos, muñecas, articulaciones, brazos y hombros',
                        opts: [
                            '10 o más espasmos en periodos de 30 segundos',
                            'Se perciben algunos espasmos en periodos de 30 segundos',
                            'No se observan espasmos'
                        ]
                    }
                ]
            }
        ];

        return areas
            .map(function (a) {
                var inner = a.tono
                    ? snTonoTableHtml()
                    : a.items.map(snNumericItem).join('');
                return (
                    '<div class="banpe-sn-area">' +
                    '<h4 class="banpe-sn-area-title">' + esc(a.area) + '</h4>' +
                    (a.note ? '<p class="banpe-sn-area-note">' + esc(a.note) + '</p>' : '') +
                    inner +
                    '</div>'
                );
            })
            .join('');
    }

    function sectionSignosHtml() {
        return (
            '<div class="banpe-sn-header">' +
            '<span class="banpe-sn-badge">BANPE</span>' +
            '<h2>EVALUACIÓN DE SIGNOS NEUROLÓGICOS</h2>' +
            '</div>' +
            '<div class="banpe-sn-intro">' +
            '<p>La evaluación de los signos neurológicos se debe realizar con cautela, dado que involucra ' +
            'el desempeño del niño en diferentes tareas, las cuales están sujetas a la observación cuidadosa ' +
            'del evaluador.</p>' +
            '<p>Cada reactivo contiene tres opciones, de las cuales el evaluador debe tachar la que más se ' +
            'ajuste a lo observado en el niño.</p>' +
            '<p>En la última columna, denominada con <strong>“SB”</strong> —signo neurológico blando—, se ' +
            'colocará una (✓) cuando el niño presente un “0” en el reactivo evaluado. Se considera que la ' +
            'presencia de dos o más signos blandos (✓) podría evidenciar una disfunción a nivel de sistema ' +
            'nervioso central; también se sabe que al menos 5% de la población presenta dos o más signos ' +
            'blandos sin que esto se asocie con daño cerebral (Hertzig, 1981; Bresalu et al., 2000).</p>' +
            '</div>' +
            expander('sn_formulario', 'Formulario de evaluación de signos neurológicos', signosFormHtml())
        );
    }

    function sectionProtocoloHtml() {
        return (
            '<div class="banpe-sn-header">' +
            '<span class="banpe-sn-badge">BANPE</span>' +
            '<h2>PROTOCOLO DE APLICACIÓN</h2>' +
            '</div>' +
            '<div class="banpe-pa-ficha">' +
            fieldRow(
                textField('nombre_nino', 'Nombre', { grow: true })
            ) +
            fieldRow(
                textField('fecha_nacimiento', 'Fecha de nacimiento', { type: 'date', grow: true }) +
                textField('pa_fecha_evaluacion', 'Fecha de evaluación', { type: 'date', grow: true })
            ) +
            fieldRow(
                selectField('pa_sexo', 'Sexo', ['Masculino', 'Femenino']) +
                textField('edad', 'Edad') +
                textField('pa_grupo', 'Grupo') +
                selectField('lateralidad', 'Lateralidad', ['Diestro', 'Zurdo', 'Ambidiestro'])
            ) +
            '</div>' +
            expander('pa_orientacion', '1. Orientación. Persona, tiempo y espacio', orientacionHtml()) +
            expander('pa_atencion', '2. Atención y concentración', atencionHtml()) +
            expander('pa_codificacion', '3. Memoria — Codificación', memoriaCodificacionHtml()) +
            expander('pa_evocacion', '4. Memoria — Evocación', memoriaEvocacionHtml()) +
            expander('pa_comprension', '5. Lenguaje — Comprensión', lenguajeComprensionHtml()) +
            expander('pa_expresion', '6. Lenguaje — Expresión', lenguajeExpresionHtml()) +
            expander('pa_articulacion', '7. Lenguaje — Articulación', lenguajeArticulacionHtml()) +
            expander('pa_coordinacion', '8. Coordinación motora', coordinacionMotoraHtml()) +
            expander('pa_academicas', '9. Habilidades académicas', habilidadesAcademicasHtml()) +
            expander('pa_inhibicion', '10. Inhibición', inhibicionSeccionHtml()) +
            expander('pa_memtrabajo', '11. Memoria de trabajo', memoriaTrabajoHtml()) +
            expander('pa_flexibilidad', '12. Flexibilidad mental', flexibilidadMentalHtml()) +
            expander('pa_planeacion', '13. Planeación', planeacionHtml()) +
            expander('pa_abstraccion', '14. Abstracción', abstraccionHtml()) +
            expander('pa_teoriamente', '15. Teoría de la mente', teoriaMenteHtml()) +
            expander('pa_riesgo', '16. Procesamiento riesgo-beneficio', riesgoBeneficioHtml()) +
            expander('pa_emociones', '17. Identificación de emociones', emocionesHtml())
        );
    }

    function countFilled(keys) {
        return keys.filter(function (k) {
            var v = hcData[k];
            return v != null && String(v).trim() !== '';
        }).length;
    }

    function recomputeOrientacionTotal() {
        var keys = ['pa_o1', 'pa_o2', 'pa_o3', 'pa_o4', 'pa_o5', 'pa_o6', 'pa_o7', 'pa_o8'];
        var total = countFilled(keys);
        hcData['pa_o_total'] = String(total);
        var el = document.getElementById('hc_pa_o_total');
        if (el) el.textContent = total;
    }

    function paTotalBox(key, total, maxPts, label) {
        return (
            '<div class="banpe-pa-total">' +
            '<span class="banpe-pa-total-label">' + esc(label || 'Total') + '</span>' +
            '<span class="banpe-pa-total-score"><strong id="hc_' + esc(key) + '">' + esc(String(total)) +
            '</strong> / ' + esc(String(maxPts)) + '</span>' +
            '<span class="banpe-pa-total-max">puntos</span>' +
            '</div>'
        );
    }

    function orientacionHtml() {
        return (
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> hacer las siguientes preguntas.</p>' +
            subHeading('Persona') +
            fieldRow(textField('pa_o1', '1. ¿Cómo te llamas?', { grow: true })) +
            fieldRow(textField('pa_o2', '2. ¿Cuántos años tienes?', { grow: true })) +
            fieldRow(textField('pa_o3', '3. ¿Cómo se llama tu mamá?', { grow: true })) +
            fieldRow(textField('pa_o4', '4. ¿Cómo se llama tu papá?', { grow: true })) +
            subHeading('Tiempo') +
            fieldRow(textField('pa_o5', '5. ¿Qué día es hoy (día de la semana)?', { grow: true })) +
            fieldRow(textField('pa_o6', '6. ¿En qué parte del día estamos en este momento (mañana/tarde/noche)?', { grow: true })) +
            fieldRow(textField('pa_o7', '7. ¿Desayunas en la mañana o en la noche?', { grow: true })) +
            subHeading('Espacio') +
            fieldRow(textField('pa_o8', '8. ¿En qué lugar estamos?', { grow: true })) +
            paTotalBox('pa_o_total', countFilled(['pa_o1', 'pa_o2', 'pa_o3', 'pa_o4', 'pa_o5', 'pa_o6', 'pa_o7', 'pa_o8']), 8)
        );
    }

    var DIGSPAN = {
        pa_dig: {
            levels: [3, 4, 5, 6, 7],
            maxPts: 7,
            showEnsayo: true,
            ejemplo: { E1: '2-5', E2: '5-3' },
            E1: { 3: '4-6-2', 4: '3-5-9-1', 5: '5-9-3-2-1', 6: '3-5-1-2-7-6', 7: '6-4-1-7-2-4-9' },
            E2: { 3: '6-7-3', 4: '6-8-2-4', 5: '4-2-1-5-7', 6: '6-9-2-5-7-1', 7: '7-3-6-8-2-1-4' }
        },
        pa_cubos: {
            levels: [3, 4, 5, 6, 7],
            maxPts: 7,
            showEnsayo: false,
            ejemplo: { E1: '2-5', E2: '5-3' },
            E1: { 3: '4-6-2', 4: '3-5-9-1', 5: '5-9-3-2-1', 6: '3-5-1-2-7-6', 7: '6-4-1-7-2-4-9' },
            E2: { 3: '6-7-3', 4: '6-8-2-4', 5: '4-2-1-5-7', 6: '6-9-2-5-7-1', 7: '7-3-6-8-2-1-4' }
        },
        pa_cubosreg: {
            levels: [2, 3, 4, 5, 6],
            maxPts: 6,
            showEnsayo: false,
            ejemplo: { E1: '2-5', E2: '5-3' },
            E1: { 2: '8-3', 3: '3-1-9', 4: '6-3-8-2', 5: '5-8-3-7-4', 6: '7-5-3-8-2-6' },
            E2: { 2: '2-7', 3: '4-8-3', 4: '2-5-1-4', 5: '6-2-5-9-3', 6: '4-8-7-3-6-9' }
        },
        pa_digreg: {
            levels: [2, 3, 4, 5, 6],
            maxPts: 6,
            showEnsayo: true,
            ejemplo: { E1: '2-5', E2: '5-3' },
            E1: { 2: '8-3', 3: '3-1-9', 4: '6-3-8-2', 5: '5-8-3-7-4', 6: '7-5-3-8-2-6' },
            E2: { 2: '2-7', 3: '4-8-3', 4: '2-5-1-4', 5: '6-2-5-9-3', 6: '4-8-7-3-6-9' }
        }
    };

    function digSpanTotal(prefix) {
        var cfg = DIGSPAN[prefix];
        var best = 0;
        cfg.levels.forEach(function (l) {
            if (hcData[prefix + '_E1_' + l] === '1' || hcData[prefix + '_E2_' + l] === '1') best = l;
        });
        return best;
    }

    function recomputeDigSpanTotal(prefix) {
        var best = digSpanTotal(prefix);
        hcData[prefix + '_total'] = String(best);
        var el = document.getElementById('hc_' + prefix + '_total');
        if (el) el.textContent = best;
    }

    function digSpanCell(prefix, ensayo, level) {
        var cfg = DIGSPAN[prefix];
        var key = prefix + '_' + ensayo + '_' + level;
        var checked = val(key) === '1' ? ' checked' : '';
        return (
            '<td class="banpe-pa-dig-cell">' +
            '<label class="banpe-pa-dig-label">' +
            '<input type="checkbox" data-hc-key="' + esc(key) + '" value="1"' + checked + ' />' +
            '<span>' + esc(cfg[ensayo][level]) + '</span>' +
            '</label>' +
            '</td>'
        );
    }

    function digSpanRow(prefix, ensayo) {
        var cfg = DIGSPAN[prefix];
        return (
            '<tr>' +
            (cfg.showEnsayo ? '<td class="banpe-pa-dig-ensayo">' + esc(ensayo) + '</td>' : '') +
            '<td class="banpe-pa-dig-ejemplo">' + esc(cfg.ejemplo[ensayo]) + '</td>' +
            cfg.levels.map(function (l) {
                return digSpanCell(prefix, ensayo, l);
            }).join('') +
            '</tr>'
        );
    }

    function digSpanHtml(prefix, intro, hint) {
        var cfg = DIGSPAN[prefix];
        return (
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> ' + intro + '</p>' +
            '<p class="banpe-pa-hint">' + hint + '</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-dig-table">' +
            '<thead><tr>' +
            (cfg.showEnsayo ? '<th>Ensayo</th>' : '') +
            '<th>Ejemplo</th>' +
            cfg.levels.map(function (l) {
                return '<th>' + l + '</th>';
            }).join('') +
            '</tr></thead>' +
            '<tbody>' +
            digSpanRow(prefix, 'E1') +
            digSpanRow(prefix, 'E2') +
            '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox(prefix + '_total', digSpanTotal(prefix), cfg.maxPts)
        );
    }

    function atencionHtml() {
        return (
            subHeading('Dígitos en progresión') +
            digSpanHtml(
                'pa_dig',
                '“Te diré unos números y tú me los repetirás cuando yo termine, en el mismo orden en que los ' +
                    'escuches. Por ejemplo, si yo te digo 2-5, tú me dices…”; esperar a que diga “2-5”, si acierta, ' +
                    'iniciar con el primer ensayo. En caso de que el niño dé otra respuesta, decirle la correcta y dar ' +
                    'el otro ejemplo; si acierta, iniciar con el primer ensayo del nivel 3.',
                'Marca la casilla de cada serie que el niño repita correctamente. El total se calcula como el mayor ' +
                    'número de dígitos alcanzado.'
            ) +
            subHeading('Cubos en progresión (Lámina 13)') +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina13">' +
            '<i class="fas fa-clock"></i> Lámina 13 (pendiente)</button></p>' +
            digSpanHtml(
                'pa_cubos',
                '“Voy a señalar unos cubos; cuando termine tú debes señalarlos igual” (poner los cubos sobre el ' +
                    'diagrama y señalarlos en el siguiente orden): llevar a cabo el ejemplo, si acierta, iniciar con ' +
                    'el primer ensayo. En caso de que el niño dé otra respuesta, realizar el siguiente ejemplo; si ' +
                    'acierta, iniciar con el primer ensayo.',
                'Marca la casilla de cada serie que el niño señale correctamente. El total se calcula como el mayor ' +
                    'número de cubos alcanzado.'
            ) +
            cancelacionVisualHtml() +
            deteccionDigitosHtml() +
            busquedaVisualHtml()
        );
    }

    var BV_FIGS = [
        { id: 'tortuga', label: 'Tortuga' },
        { id: 'avion', label: 'Avión' },
        { id: 'pelota', label: 'Pelota' },
        { id: 'bicicleta', label: 'Bicicleta' },
        { id: 'mariposa', label: 'Mariposa' }
    ];

    function bvAciertos() {
        return BV_FIGS.filter(function (f) {
            return hcData['pa_bv_' + f.id] === '1';
        }).length;
    }

    function recomputeBusquedaVisual() {
        var a = bvAciertos();
        hcData['pa_bv_aciertos'] = String(a);
        var ael = document.getElementById('hc_pa_bv_aciertos');
        if (ael) ael.textContent = a;
        var t = a - numVal('pa_bv_intrusiones');
        hcData['pa_bv_total'] = String(t);
        var tel = document.getElementById('hc_pa_bv_total');
        if (tel) tel.textContent = t;
    }

    function bvPuntuacionRow(fig) {
        var key = 'pa_bv_' + fig.id;
        return (
            '<tr>' +
            '<td class="banpe-hc-td-label">' + esc(fig.label) + '</td>' +
            '<td class="banpe-hc-td-opt"><label class="banpe-pa-bv-opt">' + radioCell(key, '0') + '<span>0</span></label></td>' +
            '<td class="banpe-hc-td-opt"><label class="banpe-pa-bv-opt">' + radioCell(key, '1') + '<span>1</span></label></td>' +
            '</tr>'
        );
    }

    function busquedaVisualHtml() {
        return (
            subHeading('Búsqueda visual (Lámina 1)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Mostrar lámina 1. “En este dibujo (señalar el dibujo ' +
            'central) debes encontrar todas estas figuras (señalar figuras que se localizan en la parte inferior) ' +
            'lo más rápido que puedas”. Tiempo límite: 30 segundos.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina1">' +
            '<i class="fas fa-clock"></i> Lámina 1 (pendiente)</button></p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-bv-table">' +
            '<thead><tr><th></th><th colspan="2">Puntuación</th></tr></thead>' +
            '<tbody>' +
            BV_FIGS.map(bvPuntuacionRow).join('') +
            '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-cancel">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Aciertos (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_bv_aciertos">' + bvAciertos() + '</div></div>' +
                textField('pa_bv_intrusiones', 'Intrusiones', { type: 'number' })
            ) +
            paTotalBox('pa_bv_total', bvAciertos() - numVal('pa_bv_intrusiones'), 5, 'Total (A − I)') +
            '</div>'
        );
    }

    /* ---------- 3. Memoria — Codificación ---------- */

    var MCV_WORDS = [
        { id: 'gato', label: 'Gato' },
        { id: 'pera', label: 'Pera' },
        { id: 'mano', label: 'Mano' },
        { id: 'fresa', label: 'Fresa' },
        { id: 'vaca', label: 'Vaca' },
        { id: 'codo', label: 'Codo' }
    ];
    var MVV_FIGS = [
        { id: 'f1', label: 'Cara', img: '/static/figuras/cara.png' },
        { id: 'f2', label: 'Pera', img: '/static/figuras/pera.png' },
        { id: 'f3', label: 'Caballo', img: '/static/figuras/caballo.png' },
        { id: 'f4', label: 'Pato', img: '/static/figuras/pato.png' },
        { id: 'f5', label: 'Ojo', img: '/static/figuras/ojo.png' },
        { id: 'f6', label: 'Rana', img: '/static/figuras/rana.png' }
    ];
    var MEMCURVE = {
        pa_mcv: { words: MCV_WORDS, extra: 7 },
        pa_mvv: { words: MVV_FIGS, extra: 7 }
    };

    function memTrialCount(prefix, t) {
        return MEMCURVE[prefix].words.filter(function (w) {
            return hcData[prefix + '_' + w.id + '_t' + t] === '1';
        }).length;
    }

    function recomputeMemCurve(prefix) {
        var counts = [1, 2, 3].map(function (t) {
            return memTrialCount(prefix, t);
        });
        [1, 2, 3].forEach(function (t, i) {
            hcData[prefix + '_t' + t] = String(counts[i]);
            var el = document.getElementById('hc_' + prefix + '_t' + t);
            if (el) el.textContent = counts[i];
        });
        var prom = Math.round(((counts[0] + counts[1] + counts[2]) / 3) * 10) / 10;
        hcData[prefix + '_volumen'] = String(prom);
        var vel = document.getElementById('hc_' + prefix + '_volumen');
        if (vel) vel.textContent = prom;
        var curva = counts[2] - counts[0];
        hcData[prefix + '_curva'] = String(curva);
        var cel = document.getElementById('hc_' + prefix + '_curva');
        if (cel) cel.textContent = curva;
    }

    function memTrialCells(rowPrefix) {
        return [1, 2, 3]
            .map(function (t) {
                var key = rowPrefix + '_t' + t;
                var ck = val(key) === '1' ? ' checked' : '';
                return (
                    '<td class="banpe-pa-mcv-opt">' +
                    '<input type="checkbox" data-hc-key="' + esc(key) + '" value="1"' + ck + ' />' +
                    '</td>'
                );
            })
            .join('');
    }

    function memWordRow(prefix, w) {
        var label;
        if (w.img) {
            label = '<span class="banpe-pa-fig-img"><img src="' + esc(w.img) + '" alt="' + esc(w.label) + '" /></span>';
        } else if (w.icon) {
            label = '<span class="banpe-pa-fig-icon">' + w.icon + '</span><span>' + esc(w.label) + '</span>';
        } else {
            label = esc(w.label);
        }
        return (
            '<tr>' +
            '<td class="banpe-hc-td-label">' + label + '</td>' +
            memTrialCells(prefix + '_' + w.id) +
            '</tr>'
        );
    }

    function memExtraRow(prefix, i, placeholder) {
        var wkey = prefix + '_x' + i + '_word';
        return (
            '<tr>' +
            '<td><input type="text" class="banpe-pa-mcv-word" data-hc-key="' + esc(wkey) + '" value="' +
            esc(val(wkey)) + '" placeholder="' + esc(placeholder) + '" /></td>' +
            memTrialCells(prefix + '_x' + i) +
            '</tr>'
        );
    }

    function memCurveTableAndMetrics(prefix, cfg) {
        var extraRows = '';
        for (var i = 1; i <= MEMCURVE[prefix].extra; i++) {
            extraRows += memExtraRow(prefix, i, cfg.extraPlaceholder);
        }
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-mcv-table">' +
            '<thead><tr><th>' + esc(cfg.firstHeader) + '</th>' +
            cfg.trialHeaders
                .map(function (h) {
                    return '<th>' + esc(h) + '</th>';
                })
                .join('') +
            '</tr></thead>' +
            '<tbody>' +
            MEMCURVE[prefix].words
                .map(function (w) {
                    return memWordRow(prefix, w);
                })
                .join('') +
            extraRows +
            '<tr class="banpe-pa-mcv-totals">' +
            '<td>Total por ensayo</td>' +
            '<td id="hc_' + prefix + '_t1">' + memTrialCount(prefix, 1) + '</td>' +
            '<td id="hc_' + prefix + '_t2">' + memTrialCount(prefix, 2) + '</td>' +
            '<td id="hc_' + prefix + '_t3">' + memTrialCount(prefix, 3) + '</td>' +
            '</tr>' +
            '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                textField(prefix + '_intrusiones', 'Intrusiones', { type: 'number' }) +
                textField(prefix + '_perseveraciones', 'Perseveraciones', { type: 'number' }) +
                '<div class="banpe-hc-field"><label>Curva de aprendizaje (T3 − T1)</label>' +
                '<div class="banpe-pa-computed" id="hc_' + prefix + '_curva">' +
                (memTrialCount(prefix, 3) - memTrialCount(prefix, 1)) + '</div></div>'
            ) +
            fieldRow(
                textField(prefix + '_primacia', 'Primacía', { type: 'number' }) +
                textField(prefix + '_recencia', 'Recencia', { type: 'number' }) +
                '<div class="banpe-hc-field"><label>Volumen total promedio</label>' +
                '<div class="banpe-pa-computed" id="hc_' + prefix + '_volumen">' +
                (Math.round(((memTrialCount(prefix, 1) + memTrialCount(prefix, 2) + memTrialCount(prefix, 3)) / 3) * 10) / 10) +
                '</div></div>'
            ) +
            '</div>'
        );
    }

    function curvaMemoriaVerbalHtml() {
        return (
            subHeading('Curva de memoria verbal') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Leeré una lista de palabras; cuando termine tú ' +
            'tendrás que repetir todas las que recuerdes, no importa el orden”. Aplicar los tres ensayos sin ' +
            'considerar si el niño completó o no la lista de palabras durante el primer o segundo ensayo. Al ' +
            'finalizar cada uno, indicarle: “Dime todas las que recuerdes”. Al terminar la prueba, advertirle: ' +
            '“Más tarde te las voy a volver a preguntar”.</p>' +
            '<p class="banpe-pa-hint">Marca la casilla del ensayo en que el niño recuerde cada palabra. Las filas ' +
            'en blanco son para registrar otras palabras (intrusiones). El total por ensayo, el volumen total ' +
            'promedio y la curva de aprendizaje se calculan automáticamente.</p>' +
            memCurveTableAndMetrics('pa_mcv', {
                firstHeader: 'Ensayo',
                trialHeaders: ['1', '2', '3'],
                extraPlaceholder: '(otra palabra)'
            })
        );
    }

    function curvaMemoriaVisualHtml() {
        var laminas = [2, 3, 4, 5]
            .map(function (n) {
                return (
                    '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" ' +
                    'data-anexo-open="lamina' + n + '"><i class="fas fa-clock"></i> Lámina ' + n + ' (pendiente)</button>'
                );
            })
            .join(' ');
        return (
            subHeading('Curva de memoria visual (Láminas 2 a 5)') +
            '<p class="banpe-pa-instr"><em>Ejemplo:</em> “Mira esta lámina” (se coloca la lámina 2 frente al niño). ' +
            '“Observa muy bien” (retirar a los cinco segundos). “Ahora mira esta lámina” (se coloca la lámina 3 ' +
            'frente al niño). “Señala las figuras que observaste en la lámina anterior”.</p>' +
            '<p class="banpe-pa-instr"><em>Prueba:</em> “Ahora vamos a hacer lo mismo con otras figuras”. Hacer ' +
            'tres ensayos con las láminas 4 y 5. Retirar los estímulos a los 10 segundos en cada ensayo. “Más ' +
            'tarde quiero que las vuelvas a señalar”.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' + laminas + '</p>' +
            '<p class="banpe-pa-hint">Marca la casilla del ensayo en que el niño señale cada figura. Las filas en ' +
            'blanco son para registrar otras figuras (intrusiones). Los totales se calculan automáticamente.</p>' +
            memCurveTableAndMetrics('pa_mvv', {
                firstHeader: 'Figura',
                trialHeaders: ['Ensayo 1', 'Ensayo 2', 'Ensayo 3'],
                extraPlaceholder: '(otra figura)'
            })
        );
    }

    function memoriaCodificacionHtml() {
        return curvaMemoriaVerbalHtml() + curvaMemoriaVisualHtml();
    }

    /* ---------- 4. Memoria — Evocación ---------- */

    function recallGrid(prefix, words) {
        return (
            '<div class="banpe-pa-recall-grid">' +
            words
                .map(function (w) {
                    var key = prefix + '_' + w.id;
                    var ck = val(key) === '1' ? ' checked' : '';
                    var inner = w.img
                        ? '<span class="banpe-pa-fig-img"><img src="' + esc(w.img) + '" alt="' + esc(w.label) + '" /></span>'
                        : '<span>' + esc(w.label) + '</span>';
                    return (
                        '<label class="banpe-pa-recall-item">' +
                        '<input type="checkbox" data-hc-key="' + esc(key) + '" value="1"' + ck + ' />' +
                        inner +
                        '</label>'
                    );
                })
                .join('') +
            '</div>'
        );
    }

    function recallCount(prefix, words) {
        return words.filter(function (w) {
            return hcData[prefix + '_' + w.id] === '1';
        }).length;
    }

    function recomputeEveEsp() {
        var c = recallCount('pa_eve', MCV_WORDS);
        hcData['pa_eve_aciertos'] = String(c);
        var el = document.getElementById('hc_pa_eve_aciertos');
        if (el) el.textContent = c;
    }

    function evocacionEspontaneaHtml() {
        return (
            subHeading('Curva de memoria verbal. Recuperación espontánea') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Hace un momento te aprendiste una lista de ' +
            'palabras, ¿cuáles recuerdas?”</p>' +
            '<p class="banpe-pa-hint">Marca las palabras que el niño recuerde espontáneamente. Los aciertos se ' +
            'calculan automáticamente.</p>' +
            recallGrid('pa_eve', MCV_WORDS) +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                textField('pa_eve_intrusiones', 'Intrusiones', { type: 'number' }) +
                textField('pa_eve_perseveraciones', 'Perseveraciones', { type: 'number' })
            ) +
            paTotalBox('pa_eve_aciertos', recallCount('pa_eve', MCV_WORDS), 6, 'Aciertos') +
            '</div>'
        );
    }

    var EVE_CLAVE_CATS = [
        { label: 'Animales', ids: ['gato', 'vaca'] },
        { label: 'Frutas', ids: ['pera', 'fresa'] },
        { label: 'Partes del cuerpo', ids: ['mano', 'codo'] }
    ];

    function wordsByIds(ids) {
        return MCV_WORDS.filter(function (w) {
            return ids.indexOf(w.id) !== -1;
        });
    }

    function recomputeEveClave() {
        var c = recallCount('pa_clave', MCV_WORDS);
        hcData['pa_clave_aciertos'] = String(c);
        var el = document.getElementById('hc_pa_clave_aciertos');
        if (el) el.textContent = c;
    }

    function evocacionClavesHtml() {
        var cats = EVE_CLAVE_CATS.map(function (cat) {
            return (
                '<div class="banpe-pa-clave-cat">' +
                '<span class="banpe-pa-clave-label">' + esc(cat.label) + ':</span>' +
                recallGrid('pa_clave', wordsByIds(cat.ids)) +
                '</div>'
            );
        }).join('');
        return (
            subHeading('Curva de memoria verbal. Recuperación por claves') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “De la lista de palabras que aprendiste te dije ' +
            'algunos animales, ¿cuáles eran?, ¿cuáles eran frutas?, ¿cuáles eran partes del cuerpo?”</p>' +
            '<p class="banpe-pa-hint">Marca las palabras que el niño recuerde con la ayuda de la clave (categoría). ' +
            'Los aciertos se calculan automáticamente.</p>' +
            cats +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                textField('pa_clave_intrusiones', 'Intrusiones', { type: 'number' }) +
                textField('pa_clave_perseveraciones', 'Perseveraciones', { type: 'number' })
            ) +
            paTotalBox('pa_clave_aciertos', recallCount('pa_clave', MCV_WORDS), 6, 'Aciertos') +
            '</div>'
        );
    }

    var REC_WORDS = [
        { id: 'boca', label: 'Boca', t: false },
        { id: 'lapiz', label: 'Lápiz', t: false },
        { id: 'gato', label: 'Gato', t: true },
        { id: 'zorro', label: 'Zorro', t: false },
        { id: 'cama', label: 'Cama', t: false },
        { id: 'mano', label: 'Mano', t: true },
        { id: 'pera', label: 'Pera', t: true },
        { id: 'fresa', label: 'Fresa', t: true },
        { id: 'codo', label: 'Codo', t: true },
        { id: 'ceja', label: 'Ceja', t: false },
        { id: 'arbol', label: 'Árbol', t: false },
        { id: 'vaca', label: 'Vaca', t: true },
        { id: 'gallo', label: 'Gallo', t: false },
        { id: 'flor', label: 'Flor', t: false }
    ];

    function recomputeReconocimiento() {
        var aciertos = REC_WORDS.filter(function (w) {
            return w.t && hcData['pa_rec_' + w.id] === '1';
        }).length;
        var intrusiones = REC_WORDS.filter(function (w) {
            return !w.t && hcData['pa_rec_' + w.id] === '1';
        }).length;
        hcData['pa_rec_aciertos'] = String(aciertos);
        hcData['pa_rec_intrusiones'] = String(intrusiones);
        hcData['pa_rec_total'] = String(aciertos - intrusiones);
        var ael = document.getElementById('hc_pa_rec_aciertos');
        if (ael) ael.textContent = aciertos;
        var iel = document.getElementById('hc_pa_rec_intrusiones');
        if (iel) iel.textContent = intrusiones;
        var tel = document.getElementById('hc_pa_rec_total');
        if (tel) tel.textContent = aciertos - intrusiones;
    }

    function reconocimientoHtml() {
        var items = REC_WORDS.map(function (w) {
            var key = 'pa_rec_' + w.id;
            var ck = val(key) === '1' ? ' checked' : '';
            return (
                '<label class="banpe-pa-recall-item">' +
                '<input type="checkbox" data-hc-key="' + esc(key) + '" value="1"' + ck + ' />' +
                '<span>' + esc(w.label) + (w.t ? '<span class="banpe-pa-rec-star">*</span>' : '') + '</span>' +
                '</label>'
            );
        }).join('');
        var aciertos = REC_WORDS.filter(function (w) {
            return w.t && hcData['pa_rec_' + w.id] === '1';
        }).length;
        var intrusiones = REC_WORDS.filter(function (w) {
            return !w.t && hcData['pa_rec_' + w.id] === '1';
        }).length;
        return (
            subHeading('Curva de memoria verbal. Reconocimiento') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Te voy a decir varias palabras, si aprendiste ' +
            'alguna de ellas en la lista que te leí hace un momento, me dirás que sí, y si no, me dirás que no.”</p>' +
            '<p class="banpe-pa-hint">Marca las palabras que el niño reconozca como parte de la lista. Las ' +
            'palabras con <strong>*</strong> pertenecen a la lista original. Aciertos, intrusiones y total se ' +
            'calculan automáticamente.</p>' +
            '<div class="banpe-pa-recall-grid banpe-pa-rec-grid">' + items + '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Aciertos (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_rec_aciertos">' + aciertos + '</div></div>' +
                '<div class="banpe-hc-field"><label>Intrusiones (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_rec_intrusiones">' + intrusiones + '</div></div>'
            ) +
            paTotalBox('pa_rec_total', aciertos - intrusiones, 6, 'Total (A − I)') +
            '</div>'
        );
    }

    function recomputeRecVis() {
        var a = recallCount('pa_recvis', MVV_FIGS);
        hcData['pa_recvis_aciertos'] = String(a);
        var ael = document.getElementById('hc_pa_recvis_aciertos');
        if (ael) ael.textContent = a;
        var t = a - numVal('pa_recvis_intrusiones');
        hcData['pa_recvis_total'] = String(t);
        var tel = document.getElementById('hc_pa_recvis_total');
        if (tel) tel.textContent = t;
    }

    function reconocimientoVisualHtml() {
        var a = recallCount('pa_recvis', MVV_FIGS);
        return (
            subHeading('Curva de memoria visual. Reconocimiento (Lámina 5)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Hace un momento nos aprendimos una lista de ' +
            'figuras; ahora te enseñaré una lámina y deberás señalar todas las que recuerdes”.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina5">' +
            '<i class="fas fa-clock"></i> Lámina 5 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca las figuras que el niño reconozca. Los aciertos y el total se calculan ' +
            'automáticamente.</p>' +
            recallGrid('pa_recvis', MVV_FIGS) +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Aciertos (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_recvis_aciertos">' + a + '</div></div>' +
                textField('pa_recvis_intrusiones', 'Intrusiones', { type: 'number' }) +
                textField('pa_recvis_perseveraciones', 'Perseveraciones', { type: 'number' })
            ) +
            paTotalBox('pa_recvis_total', a - numVal('pa_recvis_intrusiones'), 6, 'Total (A − I)') +
            '</div>'
        );
    }

    function memoriaEvocacionHtml() {
        return (
            evocacionEspontaneaHtml() +
            evocacionClavesHtml() +
            reconocimientoHtml() +
            reconocimientoVisualHtml()
        );
    }

    /* ---------- 5. Lenguaje — Comprensión ---------- */

    var COMPR = {
        pa_idc: {
            header: 'Parte del cuerpo',
            otra: true,
            items: ['Cabeza', 'Brazo', 'Mano', 'Rodilla', 'Talón', 'Palma de la mano', 'Barba o barbilla', 'Pulgar', 'Ceja', 'Codo']
        },
        pa_prep: {
            header: '“Pon el lápiz…”',
            otra: false,
            items: ['Sobre la silla', 'Debajo de la silla', 'Enfrente de la silla', 'Junto a la silla', 'Detrás de la silla']
        },
        pa_verb: {
            header: '“Dime…”',
            otra: false,
            items: [
                '¿Cuál nada en el agua?',
                '¿Cuál dice la hora?',
                '¿Con cuál escribimos?',
                '¿Con cuál leemos?',
                '¿En cuál nos sentamos a comer?'
            ]
        },
        pa_instr: {
            header: 'Tarea',
            otra: false,
            items: [
                'Enséñame tu mano izquierda',
                'Enséñame tu mano derecha',
                'Con tu mano izquierda toca tu codo derecho',
                'Señala el cuadrado pequeño',
                'Señala un círculo y un cuadrado',
                'Señala un círculo pequeño y un cuadrado grande',
                'Toca el círculo pequeño, si hay un cuadrado grande',
                'Toca el cuadrado grande en lugar del círculo pequeño',
                'Además de tocar los círculos, toca el cuadrado pequeño'
            ]
        },
        pa_plural: {
            header: 'Tarea',
            otra: false,
            items: ['Dónde están los plátanos', 'Dónde están los niños']
        },
        pa_fon: {
            header: 'Palabra',
            otra: false,
            items: [
                'Mesa', 'Llave', 'Luna', 'Chicle', 'Venado', 'Ratón', 'Jabón', 'Alacrán', 'Prendedor', 'Toalla', 'Submarino',
                'Cama', 'Pollo', 'Pelota', 'Coche', 'Tortuga', 'Perro', 'Blusa', 'Regla', 'Cocodrilo', 'Lengua', 'Aritmética'
            ]
        },
        pa_compl: {
            header: 'Tarea',
            otra: false,
            items: [
                '¿Qué haces cuando tienes sueño?',
                '¿Qué haces cuando tienes hambre?',
                '¿Qué haces cuando tienes frío?',
                '¿Para qué sirven los ojos?',
                '¿Para qué sirven los oídos?'
            ]
        },
        pa_opue: {
            header: 'Tarea',
            otra: false,
            items: [
                { text: 'Si mi hermano es un niño, mi hermana es una…', ans: 'niña' },
                { text: 'En el día hay luz y en la noche está…', ans: 'oscuro' },
                { text: 'Mi papá es un hombre, mi mamá es una…', ans: 'mujer' },
                { text: 'La serpiente es lenta y el conejo es…', ans: 'rápido' },
                { text: 'El sol brilla en el día y la luna brilla en la…', ans: 'noche' }
            ]
        },
        pa_arit: {
            header: 'Tarea',
            otra: false,
            items: [
                'Cuenta del 1 al 10',
                'Poner 12 cubos y pedir que los cuente',
                'Poner 12 cubos y pedir: “Dame tres”, “Dame nueve”, “Dame cinco”',
                'Si tienes un dulce y te doy otro dulce, ¿cuántos dulces tienes?',
                'Si tienes dos dulces y te doy dos dulces más, ¿cuántos dulces tienes?',
                'Si tienes tres dulces y te doy dos dulces más, ¿cuántos dulces tienes?',
                'Juana tenía cinco muñecas y perdió una, ¿cuántas muñecas le quedaron?'
            ]
        },
        pa_cont: {
            header: 'Tarea',
            otra: false,
            items: [
                '¿Cuántos soles hay?',
                '¿Y lunas?',
                '¿Hay más soles o lunas?'
            ]
        },
        pa_emo: {
            header: 'Pregunta',
            otra: false,
            items: [
                '¿Cuál está triste?',
                '¿Cuál está asustada?',
                '¿Cuál está enojada?',
                '¿Cuál está feliz?',
                '¿Cuál está confundida?'
            ]
        },
        pa_abs: {
            header: 'Lámina',
            otra: false,
            items: [
                'Pez con 3 ojos',
                'Mujer paseando un pulpo',
                'Elefante volando/con alas',
                'Casa al revés',
                'Hombre hablando con zapato',
                'Refrigerador en el baño',
                'Coche en el agua',
                'Bebé con puro',
                'Delfín caminando/mujer con cuerpo de delfín',
                'Reflejo en el espejo'
            ]
        }
    };

    function comprCount(prefix, value) {
        var items = COMPR[prefix].items;
        var n = 0;
        for (var i = 1; i <= items.length; i++) {
            if (hcData[prefix + '_' + i] === value) n++;
        }
        return n;
    }

    function recomputeCompr(prefix) {
        var aciertos = comprCount(prefix, '1');
        var errores = comprCount(prefix, '0');
        hcData[prefix + '_aciertos'] = String(aciertos);
        hcData[prefix + '_errores'] = String(errores);
        hcData[prefix + '_total'] = String(aciertos);
        var ael = document.getElementById('hc_' + prefix + '_aciertos');
        if (ael) ael.textContent = aciertos;
        var eel = document.getElementById('hc_' + prefix + '_errores');
        if (eel) eel.textContent = errores;
        var tel = document.getElementById('hc_' + prefix + '_total');
        if (tel) tel.textContent = aciertos;
    }

    function comprScoreRow(prefix, label, i, otra) {
        var key = prefix + '_' + i;
        return (
            '<tr>' +
            '<td class="banpe-hc-td-label"><strong>' + i + '.</strong> ' + esc(label) + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '0') + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '1') + '</td>' +
            (otra ? '<td>' + cellTextInput(prefix + '_' + i + '_otra') + '</td>' : '') +
            '</tr>'
        );
    }

    function comprScoreTableHtml(prefix) {
        var cfg = COMPR[prefix];
        var rows = cfg.items
            .map(function (label, idx) {
                return comprScoreRow(prefix, label, idx + 1, cfg.otra);
            })
            .join('');
        var header =
            '<thead>' +
            '<tr><th rowspan="2">' + esc(cfg.header) + '</th><th colspan="2">Puntuación</th>' +
            (cfg.otra ? '<th rowspan="2">Otra parte del cuerpo señalada</th>' : '') +
            '</tr>' +
            '<tr><th>0</th><th>1</th></tr>' +
            '</thead>';
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-idc-table">' +
            header +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Aciertos (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_' + prefix + '_aciertos">' + comprCount(prefix, '1') + '</div></div>' +
                '<div class="banpe-hc-field"><label>Errores (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_' + prefix + '_errores">' + comprCount(prefix, '0') + '</div></div>'
            ) +
            paTotalBox(prefix + '_total', comprCount(prefix, '1'), cfg.items.length, 'Total') +
            '</div>'
        );
    }

    function identificacionPartesHtml() {
        return (
            subHeading('Identificación de partes del cuerpo') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Ahora te voy a pedir que me muestres algunas ' +
            'partes de tu cuerpo; muéstrame tu…”.</p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada parte. Si el niño señala otra parte, ' +
            'anótala. Aciertos, errores y total se calculan automáticamente.</p>' +
            comprScoreTableHtml('pa_idc')
        );
    }

    function preposicionesHtml() {
        return (
            subHeading('Preposiciones') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Pedir que realice acciones (se sugiere tener una ' +
            'sillita de juguete).</p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada acción. Aciertos, errores y total se ' +
            'calculan automáticamente.</p>' +
            comprScoreTableHtml('pa_prep')
        );
    }

    function verbosHtml() {
        return (
            subHeading('Verbos (Lámina 6)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Presentar la lámina 6 y preguntar.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina6">' +
            '<i class="fas fa-clock"></i> Lámina 6 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada pregunta. Aciertos, errores y total ' +
            'se calculan automáticamente.</p>' +
            comprScoreTableHtml('pa_verb')
        );
    }

    var COLOR_ITEMS = [
        { id: 'azul', label: 'Azul', swatch: '#2563eb' },
        { id: 'verde', label: 'Verde', swatch: '#16a34a' },
        { id: 'rojo', label: 'Rojo', swatch: '#dc2626' },
        { id: 'amarillo', label: 'Amarillo', swatch: '#eab308' }
    ];

    function recomputeColores() {
        var total = 0;
        var aciertos = 0;
        var errores = 0;
        COLOR_ITEMS.forEach(function (c) {
            var den = hcData['pa_col_' + c.id + '_den'];
            var emp = hcData['pa_col_' + c.id + '_emp'];
            var s = (den === '2' ? 2 : 0) + (emp === '1' ? 1 : 0);
            total += s;
            if (s > 0) aciertos++;
            else if (den === '0' && emp === '0') errores++;
        });
        hcData['pa_col_total'] = String(total);
        hcData['pa_col_aciertos'] = String(aciertos);
        hcData['pa_col_errores'] = String(errores);
        var tel = document.getElementById('hc_pa_col_total');
        if (tel) tel.textContent = total;
        var ael = document.getElementById('hc_pa_col_aciertos');
        if (ael) ael.textContent = aciertos;
        var eel = document.getElementById('hc_pa_col_errores');
        if (eel) eel.textContent = errores;
    }

    function coloresMetrics() {
        var total = 0;
        var aciertos = 0;
        var errores = 0;
        COLOR_ITEMS.forEach(function (c) {
            var den = hcData['pa_col_' + c.id + '_den'];
            var emp = hcData['pa_col_' + c.id + '_emp'];
            var s = (den === '2' ? 2 : 0) + (emp === '1' ? 1 : 0);
            total += s;
            if (s > 0) aciertos++;
            else if (den === '0' && emp === '0') errores++;
        });
        return { total: total, aciertos: aciertos, errores: errores };
    }

    function coloresHtml() {
        var rows = COLOR_ITEMS.map(function (c) {
            var dk = 'pa_col_' + c.id + '_den';
            var ek = 'pa_col_' + c.id + '_emp';
            return (
                '<tr>' +
                '<td class="banpe-hc-td-label"><span class="banpe-pa-color-swatch" style="background:' + c.swatch + '"></span>' + esc(c.label) + '</td>' +
                '<td class="banpe-hc-td-opt">' + radioCell(dk, '0') + '</td>' +
                '<td class="banpe-hc-td-opt">' + radioCell(dk, '2') + '</td>' +
                '<td class="banpe-hc-td-opt">' + radioCell(ek, '0') + '</td>' +
                '<td class="banpe-hc-td-opt">' + radioCell(ek, '1') + '</td>' +
                '</tr>'
            );
        }).join('');
        var m = coloresMetrics();
        return (
            subHeading('Reconocimiento de colores (Lámina 7)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Mostrar lámina 7. “¿Cuál es el nombre de los ' +
            'colores de estos cuadros?”. En caso de que los nombre incorrectamente, pasar a la tarea de ' +
            'emparejamiento; si acierta, pasar al siguiente color. “Dime cuál de estos cuadrados (señalar todos ' +
            'los cuadros de abajo) es igual —del mismo color— a éste (señalar el primer cuadrado de arriba)”.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina7">' +
            '<i class="fas fa-clock"></i> Lámina 7 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Denominación: 2 si nombra el color correctamente. Emparejamiento (solo si ' +
            'falló la denominación): 1 si lo empareja correctamente. El total se calcula automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-col-table">' +
            '<thead>' +
            '<tr><th rowspan="2">Color</th><th colspan="2">Denominación</th><th colspan="2">Emparejamiento</th></tr>' +
            '<tr><th>0</th><th>2</th><th>0</th><th>1</th></tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Aciertos (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_col_aciertos">' + m.aciertos + '</div></div>' +
                '<div class="banpe-hc-field"><label>Errores (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_col_errores">' + m.errores + '</div></div>'
            ) +
            paTotalBox('pa_col_total', m.total, 8, 'Total') +
            '</div>'
        );
    }

    function instruccionesHtml() {
        return (
            subHeading('Instrucciones (Lámina 8)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Se solicita al niño hacer las siguientes ' +
            'actividades.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina8">' +
            '<i class="fas fa-clock"></i> Lámina 8 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada tarea. Aciertos, errores y total se ' +
            'calculan automáticamente.</p>' +
            comprScoreTableHtml('pa_instr')
        );
    }

    function pluralHtml() {
        return (
            subHeading('Plural (Láminas 9 y 10)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Colocar frente al niño las láminas 9 y 10 y ' +
            'solicitar que señale.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina9">' +
            '<i class="fas fa-clock"></i> Lámina 9 (pendiente)</button> ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina10">' +
            '<i class="fas fa-clock"></i> Lámina 10 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada tarea. Aciertos, errores y total se ' +
            'calculan automáticamente.</p>' +
            comprScoreTableHtml('pa_plural')
        );
    }

    function lenguajeComprensionHtml() {
        return (
            identificacionPartesHtml() +
            preposicionesHtml() +
            verbosHtml() +
            coloresHtml() +
            instruccionesHtml() +
            pluralHtml()
        );
    }

    /* ---------- 6. Lenguaje — Expresión ---------- */

    function punt01Cell(key) {
        return (
            '<td class="banpe-pa-punt-cell">' +
            '<label class="banpe-pa-punt-opt">' + radioCell(key, '0') + '<span>0</span></label>' +
            '<label class="banpe-pa-punt-opt">' + radioCell(key, '1') + '<span>1</span></label>' +
            '</td>'
        );
    }

    function expresionTableHtml(prefix) {
        var cfg = COMPR[prefix];
        var rows = cfg.items
            .map(function (it, idx) {
                var i = idx + 1;
                var label =
                    typeof it === 'string'
                        ? esc(it)
                        : esc(it.text) + (it.ans ? ' <span class="banpe-pa-expr-ans">(' + esc(it.ans) + ')</span>' : '');
                return (
                    '<tr>' +
                    '<td class="banpe-hc-td-label">' + label + '</td>' +
                    '<td>' + cellTextInput(prefix + '_' + i + '_resp') + '</td>' +
                    punt01Cell(prefix + '_' + i) +
                    '</tr>'
                );
            })
            .join('');
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-expr-table">' +
            '<thead><tr><th>Tarea</th><th>Respuesta</th><th>Puntuación</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Aciertos (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_' + prefix + '_aciertos">' + comprCount(prefix, '1') + '</div></div>' +
                '<div class="banpe-hc-field"><label>Errores (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_' + prefix + '_errores">' + comprCount(prefix, '0') + '</div></div>'
            ) +
            paTotalBox(prefix + '_total', comprCount(prefix, '1'), cfg.items.length, 'Total') +
            '</div>'
        );
    }

    function completarOracionesHtml() {
        return (
            subHeading('Completar oraciones') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Preguntar al niño.</p>' +
            '<p class="banpe-pa-hint">Anota la respuesta y marca 1 (acierto) o 0 (error). Aciertos, errores y ' +
            'total se calculan automáticamente.</p>' +
            expresionTableHtml('pa_compl')
        );
    }

    function opuestosHtml() {
        return (
            subHeading('Opuestos') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Hacer al niño las siguientes preguntas.</p>' +
            '<p class="banpe-pa-hint">Entre paréntesis se muestra la respuesta esperada. Anota la respuesta del ' +
            'niño y marca 1 (acierto) o 0 (error). Aciertos, errores y total se calculan automáticamente.</p>' +
            expresionTableHtml('pa_opue')
        );
    }

    function conversacionHtml() {
        return (
            subHeading('Conversación') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Cuéntame acerca de tu familia. ¿Quién(es) ' +
            'conforma(n) tu familia? ¿Con quién vives? ¿Con quién te gusta jugar? ¿A qué te gusta jugar?” ' +
            '(máximo tres minutos).</p>' +
            fieldRow(textareaField('pa_conv_texto', 'Registro de la conversación', { rows: 6 })) +
            fieldRow(textField('pa_conv_oraciones', 'Número de oraciones (Total)', { type: 'number' }))
        );
    }

    var FLU_CELLS = 32;

    function recomputeFluidez() {
        var n = 0;
        for (var i = 1; i <= FLU_CELLS; i++) {
            var v = hcData['pa_flu_' + i];
            if (v != null && String(v).trim() !== '') n++;
        }
        hcData['pa_flu_palabras'] = String(n);
        var el = document.getElementById('hc_pa_flu_palabras');
        if (el) el.textContent = n;
    }

    function fluidezVerbalHtml() {
        var cells = '';
        for (var i = 1; i <= FLU_CELLS; i++) {
            var key = 'pa_flu_' + i;
            cells +=
                '<input type="text" class="banpe-pa-flu-cell" data-hc-key="' + esc(key) + '" value="' +
                esc(val(key)) + '" />';
        }
        var palabras = 0;
        for (var j = 1; j <= FLU_CELLS; j++) {
            var vv = hcData['pa_flu_' + j];
            if (vv != null && String(vv).trim() !== '') palabras++;
        }
        return (
            subHeading('Fluidez verbal') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Dime todos los nombres de animales que recuerdes; ' +
            'tienes que hacerlo lo más rápido que puedas. Comenzamos ya” (un minuto).</p>' +
            '<p class="banpe-pa-hint">Anota cada animal en una casilla. El número de palabras anotadas se cuenta ' +
            'automáticamente; aciertos, intrusiones y perseveraciones se registran manualmente.</p>' +
            '<div class="banpe-pa-flu-grid">' + cells + '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Palabras anotadas (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_flu_palabras">' + palabras + '</div></div>' +
                textField('pa_flu_aciertos', 'Aciertos', { type: 'number' })
            ) +
            fieldRow(
                textField('pa_flu_intrusiones', 'Intrusiones', { type: 'number' }) +
                textField('pa_flu_perseveraciones', 'Perseveraciones', { type: 'number' })
            ) +
            '</div>'
        );
    }

    function lenguajeExpresionHtml() {
        return completarOracionesHtml() + opuestosHtml() + conversacionHtml() + fluidezVerbalHtml();
    }

    /* ---------- 7. Lenguaje — Articulación ---------- */

    var SUMTABLE = {
        pa_oro: {
            header: 'Tarea',
            opts: ['0', '1', '2'],
            items: [
                'Sacar la lengua',
                'Tocar con la lengua el labio superior',
                'Tocar con la lengua el labio inferior',
                'Mover lengua derecha-izquierda'
            ]
        },
        pa_cmg: {
            header: 'Actividad',
            opts: ['0', '1', '2'],
            items: [
                'Caminar en línea recta',
                'Caminar sobre una línea recta',
                'Caminar alternando punta-talón (“marcha tándem”)',
                'Mantenerse en un pie (preferencia) (contar tiempo). Tiempo límite: 10 segundos',
                'Mantenerse en el otro pie (contar tiempo). Tiempo límite: 10 segundos',
                'Pararse en un pie, delante del otro, con ojos cerrados. Tiempo límite: 10 segundos',
                'Saltar hacia adelante y hacia atrás (con ambos pies juntos)',
                'Saltar con un pie (preferencia) (2 a 8 saltos seguidos)',
                'Saltar con el otro pie (2 a 8 saltos seguidos)',
                'Patear una pelota con un pie (preferencia) (2 a 8 saltos seguidos)',
                'Patear una pelota con el otro pie',
                'Aventar una pelota con una mano (preferencia)',
                'Aventar una pelota con la otra mano',
                'Atrapar una pelota con una mano (preferencia)',
                'Atrapar una pelota con la otra mano',
                'Atrapar una pelota con ambas manos'
            ],
            /* Reactivos sin columna de preferencia (actividades bilaterales). */
            noPref: [1, 2, 3, 6]
        },
        pa_cmf: {
            header: 'Actividad',
            opts: ['0', '1', '2'],
            items: [
                'Cortar con tijeras siguiendo una línea (mano que prefiera)',
                'Cortar con tijeras siguiendo una línea (la otra mano)',
                'Copia de línea vertical',
                'Copia de línea horizontal',
                'Copia de círculo',
                'Copia de cruz',
                'Copia de triángulo',
                'Copia de cuadrado',
                'Copia de estrella',
                'Copia de rombo',
                'Copia de semicuadrado-círculo'
            ]
        }
    };

    function sumTableTotal(prefix) {
        var items = SUMTABLE[prefix].items;
        var t = 0;
        for (var i = 1; i <= items.length; i++) {
            var v = parseInt(hcData[prefix + '_' + i], 10);
            if (!isNaN(v)) t += v;
        }
        return t;
    }

    function recomputeSumTable(prefix) {
        var t = sumTableTotal(prefix);
        hcData[prefix + '_total'] = String(t);
        var el = document.getElementById('hc_' + prefix + '_total');
        if (el) el.textContent = t;
    }

    function sumTableHtml(prefix) {
        var cfg = SUMTABLE[prefix];
        var maxPts = cfg.items.length * Math.max.apply(null, cfg.opts.map(Number));
        var rows = cfg.items
            .map(function (label, idx) {
                var i = idx + 1;
                var key = prefix + '_' + i;
                var opts = cfg.opts
                    .map(function (o) {
                        return '<td class="banpe-hc-td-opt">' + radioCell(key, o) + '</td>';
                    })
                    .join('');
                return (
                    '<tr>' +
                    '<td class="banpe-hc-td-label"><strong>' + i + '.</strong> ' + esc(label) + '</td>' +
                    opts +
                    '</tr>'
                );
            })
            .join('');
        var headOpts = cfg.opts
            .map(function (o) {
                return '<th>' + esc(o) + '</th>';
            })
            .join('');
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-idc-table">' +
            '<thead>' +
            '<tr><th rowspan="2">' + esc(cfg.header) + '</th><th colspan="' + cfg.opts.length + '">Puntuación</th></tr>' +
            '<tr>' + headOpts + '</tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox(prefix + '_total', sumTableTotal(prefix), maxPts, 'Total')
        );
    }

    function estructurasOrofacialesHtml() {
        return (
            subHeading('Estructuras orofaciales') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Ahora vamos a jugar con nuestra boca y nuestra ' +
            'lengua; mira, haz así” (modelar al niño cada posición).</p>' +
            '<p class="banpe-pa-hint">Puntúa cada tarea (0, 1 o 2). El total se calcula automáticamente.</p>' +
            sumTableHtml('pa_oro')
        );
    }

    function fonemaCell(i) {
        var key = 'pa_fon_' + i;
        var label = COMPR.pa_fon.items[i - 1];
        return (
            '<td class="banpe-hc-td-label">' + esc(label) + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '0') + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '1') + '</td>'
        );
    }

    function fonemasHtml() {
        var rows = '';
        for (var r = 0; r < 11; r++) {
            rows += '<tr>' + fonemaCell(r + 1) + fonemaCell(r + 12) + '</tr>';
        }
        return (
            subHeading('Repetición de fonemas simples y compuestos') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Repite”.</p>' +
            '<p class="banpe-pa-hint">Marca 1 (correcto) o 0 (incorrecto) por cada palabra. El total se calcula ' +
            'automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-fon-table">' +
            '<thead>' +
            '<tr><th rowspan="2">Palabra</th><th colspan="2">Puntuación</th>' +
            '<th rowspan="2">Palabra</th><th colspan="2">Puntuación</th></tr>' +
            '<tr><th>0</th><th>1</th><th>0</th><th>1</th></tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox('pa_fon_total', comprCount('pa_fon', '1'), 22, 'Total')
        );
    }

    function lenguajeArticulacionHtml() {
        return estructurasOrofacialesHtml() + fonemasHtml();
    }

    /* ---------- 8. Coordinación motora ---------- */

    function motoraGruesaHtml() {
        var cfg = SUMTABLE.pa_cmg;
        var maxPts = cfg.items.length * 2;
        var noPref = cfg.noPref || [];
        var rows = cfg.items
            .map(function (label, idx) {
                var i = idx + 1;
                var key = 'pa_cmg_' + i;
                var opts = cfg.opts
                    .map(function (o) {
                        return '<td class="banpe-hc-td-opt">' + radioCell(key, o) + '</td>';
                    })
                    .join('');
                var prefCell =
                    noPref.indexOf(i) !== -1
                        ? '<td class="banpe-pa-cmg-na"></td>'
                        : '<td>' + cellTextInput(key + '_pref', { placeholder: 'Izq / Der' }) + '</td>';
                return (
                    '<tr>' +
                    '<td class="banpe-hc-td-num">' + i + '</td>' +
                    '<td class="banpe-hc-td-label">' + esc(label) + '</td>' +
                    opts +
                    prefCell +
                    '</tr>'
                );
            })
            .join('');
        return (
            subHeading('Coordinación motora gruesa') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Solicitar al niño hacer las siguientes ' +
            'actividades.</p>' +
            '<p class="banpe-pa-hint">Puntúa cada actividad (0, 1 o 2). En las actividades unilaterales anota la ' +
            'mano/pie de preferencia. El total se calcula automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-cmg-table">' +
            '<thead>' +
            '<tr><th rowspan="2"></th><th rowspan="2">Actividad</th>' +
            '<th colspan="3">Puntuación</th><th rowspan="2">Preferencia</th></tr>' +
            '<tr><th>0</th><th>1</th><th>2</th></tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox('pa_cmg_total', sumTableTotal('pa_cmg'), maxPts, 'Total')
        );
    }

    function motoraFinaHtml() {
        return (
            subHeading('Coordinación motora fina (Anexos 2 y 3)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Se solicita al niño hacer las siguientes ' +
            'actividades (anexos 2 y 3).</p>' +
            '<p class="banpe-pa-hint">Consulta las láminas de apoyo:</p>' +
            '<div class="banpe-anexo-links">' +
            '<button type="button" class="banpe-anexo-link" data-anexo-open="2">' +
            '<i class="fas fa-image"></i> Anexo 2</button>' +
            '<button type="button" class="banpe-anexo-link" data-anexo-open="3">' +
            '<i class="fas fa-image"></i> Anexo 3</button>' +
            '</div>' +
            '<p class="banpe-pa-hint">Puntúa cada actividad (0, 1 o 2). El total se calcula automáticamente.</p>' +
            sumTableHtml('pa_cmf')
        );
    }

    function coordinacionMotoraHtml() {
        return motoraGruesaHtml() + motoraFinaHtml();
    }

    /* ---------- 9. Habilidades académicas ---------- */

    var ILN_NUM = ['1', '2', '3', '4', '5'];
    var ILN_LET = ['a', 'e', 'i', 'o', 'u'];

    function ilnKeys() {
        var keys = [];
        ILN_NUM.forEach(function (n) { keys.push('pa_iln_n' + n); });
        ILN_LET.forEach(function (l) { keys.push('pa_iln_l' + l); });
        return keys;
    }

    function ilnTotal() {
        return ilnKeys().filter(function (k) { return hcData[k] === '1'; }).length;
    }

    function recomputeIln() {
        var t = ilnTotal();
        hcData['pa_iln_total'] = String(t);
        var el = document.getElementById('hc_pa_iln_total');
        if (el) el.textContent = t;
    }

    function ilnCell(key, label) {
        var checked = val(key) === '1' ? ' checked' : '';
        return (
            '<td class="banpe-hc-td-opt">' +
            '<label class="banpe-pa-iln-cell">' +
            '<input type="checkbox" data-hc-key="' + esc(key) + '" value="1"' + checked + ' />' +
            '<span>' + esc(label) + '</span>' +
            '</label>' +
            '</td>'
        );
    }

    function identificacionLetrasNumerosHtml() {
        var numRow = ILN_NUM
            .map(function (n) { return ilnCell('pa_iln_n' + n, n); })
            .join('');
        var letRow = ILN_LET
            .map(function (l) { return ilnCell('pa_iln_l' + l, l); })
            .join('');
        return (
            subHeading('Identificación de letras y números (Lámina 11)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Señala todos los números; ahora señala todas ' +
            'las letras”.</p>' +
            '<p class="banpe-pa-hint">Consulta la lámina de apoyo en el ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina11">' +
            '<i class="fas fa-clock"></i> Lámina 11</button> (pendiente). Marca cada elemento que el niño ' +
            'identifique correctamente. El total se calcula automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-iln-table">' +
            '<thead><tr><th></th><th colspan="5">Respuesta</th></tr></thead>' +
            '<tbody>' +
            '<tr><td class="banpe-hc-td-label">Señalar números</td>' + numRow + '</tr>' +
            '<tr><td class="banpe-hc-td-label">Señalar letras</td>' + letRow + '</tr>' +
            '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox('pa_iln_total', ilnTotal(), 10, 'Total')
        );
    }

    function aritmeticaHtml() {
        return (
            subHeading('Aritmética') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Dar las siguientes instrucciones.</p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada tarea. Aciertos, errores y total se ' +
            'calculan automáticamente.</p>' +
            comprScoreTableHtml('pa_arit')
        );
    }

    function conteoHtml() {
        return (
            subHeading('Conteo (Lámina 12)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Mira esta lámina y dime”.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina12">' +
            '<i class="fas fa-clock"></i> Lámina 12 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada tarea. Aciertos, errores y total se ' +
            'calculan automáticamente.</p>' +
            comprScoreTableHtml('pa_cont')
        );
    }

    function habilidadesAcademicasHtml() {
        return identificacionLetrasNumerosHtml() + aritmeticaHtml() + conteoHtml();
    }

    /* ---------- 10. Inhibición ---------- */

    var STROOP_LEFT = [
        { id: 'e1', label: 'E1. Ángel: ponte de pie', ex: true },
        { id: '1', label: '1. Ángel: toca tus ojos', type: 'angel' },
        { id: '2', label: '2. Diablo: toca tus orejas', type: 'diablo' },
        { id: '3', label: '3. Ángel: mueve la cabeza', type: 'angel' },
        { id: '4', label: '4. Diablo: saca la lengua', type: 'diablo' },
        { id: '5', label: '5. Diablo: alza tu brazo', type: 'diablo' }
    ];
    var STROOP_RIGHT = [
        { id: 'e2', label: 'E2. Diablo: siéntate', ex: true },
        { id: '6', label: '6. Ángel: toca tu panza', type: 'angel' },
        { id: '7', label: '7. Diablo: toca tu nariz', type: 'diablo' },
        { id: '8', label: '8. Diablo: aplaude', type: 'diablo' },
        { id: '9', label: '9. Ángel: cierra y abre ojos', type: 'angel' },
        { id: '10', label: '10. Diablo: haz cara fea', type: 'diablo' }
    ];

    function stroopSum(type) {
        var t = 0;
        STROOP_LEFT.concat(STROOP_RIGHT).forEach(function (it) {
            if (it.type === type) {
                var v = parseInt(hcData['pa_stroop_' + it.id], 10);
                if (!isNaN(v)) t += v;
            }
        });
        return t;
    }

    function recomputeStroop() {
        var angel = stroopSum('angel');
        var diablo = stroopSum('diablo');
        var total = angel + diablo;
        hcData['pa_stroop_angel'] = String(angel);
        hcData['pa_stroop_diablo'] = String(diablo);
        hcData['pa_stroop_total'] = String(total);
        var a = document.getElementById('hc_pa_stroop_angel');
        if (a) a.textContent = angel;
        var d = document.getElementById('hc_pa_stroop_diablo');
        if (d) d.textContent = diablo;
        var tl = document.getElementById('hc_pa_stroop_total');
        if (tl) tl.textContent = total;
    }

    function stroopCells(item) {
        var key = 'pa_stroop_' + item.id;
        return (
            ['0', '1', '2']
                .map(function (o) {
                    return '<td class="banpe-hc-td-opt">' + radioCell(key, o) + '</td>';
                })
                .join('')
        );
    }

    function stroopRowLabel(item) {
        var cls = item.ex ? 'banpe-hc-td-label banpe-pa-stroop-ex' : 'banpe-hc-td-label';
        return '<td class="' + cls + '">' + esc(item.label) + '</td>';
    }

    function inhibicionHtml() {
        var rows = '';
        for (var i = 0; i < STROOP_LEFT.length; i++) {
            rows +=
                '<tr>' +
                stroopRowLabel(STROOP_LEFT[i]) + stroopCells(STROOP_LEFT[i]) +
                stroopRowLabel(STROOP_RIGHT[i]) + stroopCells(STROOP_RIGHT[i]) +
                '</tr>';
        }
        return (
            subHeading('Stroop Ángel-Diablo') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Te presento a unos amigos: ella es Ángel y este es ' +
            'Diablo. El juego se trata de que ellos te van a decir que hagas algo, pero tú sólo tienes que hacerle ' +
            'caso a Ángel y no debes hacer caso a lo que te dice Diablo”. Llevar a cabo los dos ejemplos; si ' +
            'acierta, iniciar con el primer ensayo. En caso de que el niño dé otra respuesta, decirle nuevamente la ' +
            'instrucción; si acierta, iniciar con el primer ensayo.</p>' +
            '<p class="banpe-pa-hint">Los ejemplos (E1 y E2) no suman al total. Puntuación Diablo, Puntuación Ángel ' +
            'y Total se calculan automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-stroop-table">' +
            '<thead>' +
            '<tr><th rowspan="2">Ensayo</th><th colspan="3">Puntuación</th>' +
            '<th rowspan="2">Ensayo</th><th colspan="3">Puntuación</th></tr>' +
            '<tr><th>0</th><th>1</th><th>2</th><th>0</th><th>1</th><th>2</th></tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Puntuación Diablo (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_stroop_diablo">' + stroopSum('diablo') + '</div></div>' +
                '<div class="banpe-hc-field"><label>Puntuación Ángel (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_stroop_angel">' + stroopSum('angel') + '</div></div>'
            ) +
            paTotalBox('pa_stroop_total', stroopSum('angel') + stroopSum('diablo'), 20, 'Total') +
            '</div>'
        );
    }

    /* Stroop Día-Noche */

    var STROOPDN_LEFT = [
        { id: 'e1', ensayo: 'E1. Luna', esp: 'Día', ex: true },
        { id: '1', ensayo: '1. Sol', esp: 'Noche' },
        { id: '2', ensayo: '2. Luna', esp: 'Día' },
        { id: '3', ensayo: '3. Luna', esp: 'Día' },
        { id: '4', ensayo: '4. Sol', esp: 'Noche' },
        { id: '5', ensayo: '5. Luna', esp: 'Día' },
        { id: '6', ensayo: '6. Sol', esp: 'Noche' },
        { id: '7', ensayo: '7. Sol', esp: 'Noche' },
        { id: '8', ensayo: '8. Luna', esp: 'Día' }
    ];
    var STROOPDN_RIGHT = [
        { id: 'e2', ensayo: 'E2. Sol', esp: 'Noche', ex: true },
        { id: '9', ensayo: '9. Luna', esp: 'Día' },
        { id: '10', ensayo: '10. Sol', esp: 'Noche' },
        { id: '11', ensayo: '11. Luna', esp: 'Día' },
        { id: '12', ensayo: '12. Sol', esp: 'Noche' },
        { id: '13', ensayo: '13. Sol', esp: 'Noche' },
        { id: '14', ensayo: '14. Luna', esp: 'Día' },
        { id: '15', ensayo: '15. Sol', esp: 'Noche' },
        { id: '16', ensayo: '16. Luna', esp: 'Día' }
    ];

    function stroopDnAciertos() {
        var n = 0;
        STROOPDN_LEFT.concat(STROOPDN_RIGHT).forEach(function (it) {
            if (!it.ex && hcData['pa_dn_' + it.id] === '1') n++;
        });
        return n;
    }

    function recomputeStroopDn() {
        var a = stroopDnAciertos();
        hcData['pa_dn_aciertos'] = String(a);
        var el = document.getElementById('hc_pa_dn_aciertos');
        if (el) el.textContent = a;
    }

    function stroopDnRowCells(item) {
        var key = 'pa_dn_' + item.id;
        var cls = item.ex ? 'banpe-hc-td-label banpe-pa-stroop-ex' : 'banpe-hc-td-label';
        var espCls = item.ex ? 'banpe-pa-dn-esp banpe-pa-stroop-ex' : 'banpe-pa-dn-esp';
        return (
            '<td class="' + cls + '">' + esc(item.ensayo) + '</td>' +
            '<td class="' + espCls + '">' + esc(item.esp) + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '0') + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '1') + '</td>'
        );
    }

    function inhibicionSeccionHtml() {
        return inhibicionHtml() + stroopDiaNocheHtml() + punoDedoHtml() + demoraGratificacionHtml();
    }

    /* Demora de gratificación */

    function demoraGratificacionHtml() {
        return (
            subHeading('Demora de gratificación') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Tengo un regalo para ti, sólo que olvidé envolverlo, ' +
            'así que no voltees mientras lo envuelvo para que sea una gran sorpresa; yo te digo cuando haya ' +
            'terminado y puedas voltear”.</p>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(textField('pa_demora_voltea', 'Total de veces que voltea', { type: 'number' })) +
            '</div>'
        );
    }

    /* ---------- 11. Memoria de trabajo ---------- */

    /* Progresión vertical (niveles en filas, E1/E2 con casilla de respuesta). */
    function progVertTotal(prefix, levels) {
        var best = 0;
        levels.forEach(function (lv) {
            if (hcData[prefix + '_E1_' + lv.n] === '1' || hcData[prefix + '_E2_' + lv.n] === '1') best = lv.n;
        });
        return best;
    }

    function recomputeProgVert(prefix, levels) {
        var best = progVertTotal(prefix, levels);
        hcData[prefix + '_total'] = String(best);
        var el = document.getElementById('hc_' + prefix + '_total');
        if (el) el.textContent = best;
    }

    function progVertCheck(key) {
        var checked = val(key) === '1' ? ' checked' : '';
        return (
            '<label class="banpe-pa-prog-check">' +
            '<input type="checkbox" data-hc-key="' + esc(key) + '" value="1"' + checked + ' />' +
            '<span>Correcto</span>' +
            '</label>'
        );
    }

    function progVertHtml(prefix, cfg) {
        var rows = '';
        if (cfg.ejemplo) {
            rows +=
                '<tr class="banpe-pa-prog-ej">' +
                '<td></td>' +
                '<td class="banpe-hc-td-label"><strong>EJEMPLO/</strong> ' + esc(cfg.ejemplo) + ' /</td>' +
                '<td class="banpe-hc-td-opt">' + progVertCheck(prefix + '_ej') + '</td>' +
                '</tr>';
        }
        cfg.levels.forEach(function (lv) {
            rows +=
                '<tr>' +
                '<td class="banpe-pa-prog-nivel" rowspan="2">' + lv.n + '</td>' +
                '<td class="banpe-hc-td-label">E 1. ' + esc(lv.E1) + '</td>' +
                '<td class="banpe-hc-td-opt">' + progVertCheck(prefix + '_E1_' + lv.n) + '</td>' +
                '</tr>' +
                '<tr>' +
                '<td class="banpe-hc-td-label">E 2. ' + esc(lv.E2) + '</td>' +
                '<td class="banpe-hc-td-opt">' + progVertCheck(prefix + '_E2_' + lv.n) + '</td>' +
                '</tr>';
        });
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-prog-table">' +
            '<thead><tr><th>Nivel</th><th>Ensayos</th><th>Respuesta</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox(prefix + '_total', progVertTotal(prefix, cfg.levels), cfg.maxPts, 'Total')
        );
    }

    var LECHE = {
        maxPts: 5,
        ejemplo: 'Doctor, bailarina',
        levels: [
            { n: 2, E1: 'Payaso, maestra', E2: 'Policía, doctor' },
            { n: 3, E1: 'Bailarina, doctor, policía', E2: 'Doctor, payaso, maestra' },
            { n: 4, E1: 'Maestra, policía, payaso, doctor', E2: 'Policía, doctor, bailarina, payaso' },
            { n: 5, E1: 'Policía, bailarina, payaso, doctor, maestra', E2: 'Payaso, maestra, policía, doctor, bailarina' }
        ]
    };

    function repartiendoLecheHtml() {
        return (
            subHeading('Repartiendo leche (Lámina 14)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “La vaca irá a dejarle leche a varias personas. Al ' +
            'terminar tiene que pasar por sus botellitas. Tú tienes que llevarla de regreso, pasando por todos los ' +
            'lugares en el orden contrario a como los llevó. No olvides ninguno”. Realizar ejemplo y comenzar la ' +
            'prueba. Llevar a cabo el ejemplo; si acierta, iniciar con el primer ensayo. En caso de que el niño dé ' +
            'otra respuesta, realizar el siguiente ejemplo; si acierta, iniciar con el primer ensayo.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina14">' +
            '<i class="fas fa-clock"></i> Lámina 14 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca la casilla de cada serie que el niño repita correctamente. El total se ' +
            'calcula como el mayor nivel alcanzado.</p>' +
            progVertHtml('pa_leche', LECHE)
        );
    }

    function cubosRegresionHtml() {
        return (
            subHeading('Cubos en regresión (Lámina 13)') +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina13">' +
            '<i class="fas fa-clock"></i> Lámina 13 (pendiente)</button></p>' +
            digSpanHtml(
                'pa_cubosreg',
                '“Voy a señalar unos cubos; cuando termine, tú debes señalarlos al revés, desde el último hasta el ' +
                    'primero” (poner los cubos sobre el diagrama y señalarlos en el siguiente orden): Llevar a cabo el ' +
                    'ejemplo; si acierta, iniciar con el primer ensayo. En caso de que el niño dé otra respuesta, ' +
                    'realizar el siguiente ejemplo; si acierta, iniciar con el primer ensayo.',
                'Marca la casilla de cada serie que el niño señale correctamente. El total se calcula como el mayor ' +
                    'nivel alcanzado.'
            )
        );
    }

    function digitosRegresionHtml() {
        return (
            subHeading('Dígitos en regresión') +
            digSpanHtml(
                'pa_digreg',
                '“Ahora te diré unos números y tú me los repetirás al revés, del último al primero. Por ejemplo, si ' +
                    'yo te digo 2-5, tú me dices…”; esperar a que diga “5-2”, si acierta, iniciar con el primer ensayo. ' +
                    'En caso de que el niño dé otra respuesta, decirle la correcta y dar el otro ejemplo; si acierta, ' +
                    'iniciar con el primer ensayo del nivel 2.',
                'Marca la casilla de cada serie que el niño repita correctamente. El total se calcula como el mayor ' +
                    'nivel alcanzado.'
            )
        );
    }

    function memoriaTrabajoHtml() {
        return repartiendoLecheHtml() + cubosRegresionHtml() + digitosRegresionHtml();
    }

    /* ---------- 12. Flexibilidad mental ---------- */

    var CAT_OPTS = ['C', 'F', 'T', 'O'];

    function catItemCells(prefix, i) {
        var key = prefix + '_' + i;
        var opts = CAT_OPTS
            .map(function (o) {
                return '<label class="banpe-pa-cat-opt">' + radioCell(key, o) + '<span>' + o + '</span></label>';
            })
            .join('');
        return (
            '<td class="banpe-pa-cat-num">' + i + '</td>' +
            '<td class="banpe-pa-cat-opts">' + opts + '</td>'
        );
    }

    function categorizacionTableHtml(prefix, count) {
        var perCol = count / 3;
        var rows = '';
        for (var r = 0; r < perCol; r++) {
            rows += '<tr>';
            for (var c = 0; c < 3; c++) {
                rows += catItemCells(prefix, c * perCol + r + 1);
            }
            rows += '</tr>';
        }
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-cat-table">' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>'
        );
    }

    function categorizacionMetricsHtml(prefix) {
        return (
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                textField(prefix + '_aciertos', 'Aciertos', { type: 'number' }) +
                textField(prefix + '_errores', 'Errores', { type: 'number' }) +
                textField(prefix + '_persev', 'Perseveraciones', { type: 'number' })
            ) +
            fieldRow(
                textField(prefix + '_persev_crit', 'Perseveraciones de criterio', { type: 'number' }) +
                textField(prefix + '_error_mant', 'Error de mantenimiento', { type: 'number' })
            ) +
            '</div>'
        );
    }

    function categorizacionAHtml() {
        return (
            subHeading('Categorización A (Lámina 15)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Éste es el juego de los colores; todos los azules ' +
            'van con el azul (señalar el lado derecho) y todos los rojos van con el rojo (señalar el lado ' +
            'izquierdo)”. Hacer lo mismo para dibujo y tamaño.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina15">' +
            '<i class="fas fa-clock"></i> Lámina 15 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca por cada reactivo la categoría usada por el niño: ' +
            '<strong>C</strong> color, <strong>F</strong> forma, <strong>T</strong> tamaño, <strong>O</strong> otro. ' +
            'Registra abajo las puntuaciones.</p>' +
            categorizacionTableHtml('pa_catA', 18) +
            categorizacionMetricsHtml('pa_catA')
        );
    }

    function categorizacionBHtml() {
        return (
            subHeading('Categorización B (Lámina 15)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Como lo hiciste muy bien, ahora tú debes adivinar ' +
            'qué juego estamos jugando: si el del color, el de los dibujos o el del tamaño. Vas a tomar una por una ' +
            'las cartas que están aquí y las vas a poner debajo de la carta donde tú creas que vayan. Te diré SÍ ' +
            'cuando lo hagas bien y NO cuando no sea correcto. Puede ser que yo cambie el juego, pero sin avisarte; ' +
            'tú tienes que adivinar qué juego es.”</p>' +
            '<p class="banpe-pa-hint">Orden de criterios: 1. Forma, 2. Color, 3. Tamaño, 4. Color, 5. Forma y ' +
            '6. Tamaño.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina15">' +
            '<i class="fas fa-clock"></i> Lámina 15 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca por cada reactivo la categoría usada por el niño: ' +
            '<strong>C</strong> color, <strong>F</strong> forma, <strong>T</strong> tamaño, <strong>O</strong> otro. ' +
            'Registra abajo las puntuaciones.</p>' +
            categorizacionTableHtml('pa_catB', 30) +
            categorizacionMetricsHtml('pa_catB')
        );
    }

    function flexibilidadMentalHtml() {
        return categorizacionAHtml() + categorizacionBHtml();
    }

    /* ---------- 13. Planeación ---------- */

    var CARTERO = {
        maxPts: 5,
        ejemplo: null,
        levels: [
            { n: 2, E1: 'Azul, negra', E2: 'Rosa, amarilla' },
            { n: 3, E1: 'Roja, negra, amarilla', E2: 'Azul, rosa, negra' },
            { n: 4, E1: 'Amarilla, rosa, roja, azul', E2: 'Negra, azul, amarilla, roja' },
            { n: 5, E1: 'Rosa, negra, roja, azul, amarilla', E2: 'Azul, amarilla, roja, negra, rosa' }
        ]
    };

    function elCarteroHtml() {
        return (
            subHeading('El cartero') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Necesitamos entregar estas invitaciones lo más ' +
            'rápido posible, así que hay que acomodarlas en el camión. No puedes tomar las que estén abajo, sólo ' +
            'puedes entregar cada vez la que está arriba y el camión no puede regresar”.</p>' +
            '<p class="banpe-pa-hint">Marca la casilla de cada serie que el niño resuelva correctamente. El total ' +
            'se calcula como el mayor nivel alcanzado.</p>' +
            progVertHtml('pa_cartero', CARTERO) +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                textField('pa_cartero_err1', 'Error 1 (tomar cartas de abajo)', { type: 'number' }) +
                textField('pa_cartero_err2', 'Error 2 (regresar)', { type: 'number' }) +
                textField('pa_cartero_err3', 'Error 3 (color carta-casa)', { type: 'number' })
            ) +
            '</div>'
        );
    }

    /* Laberintos */

    var LAB_LEFT = [
        { id: '1', label: '1a / 1b' },
        { id: '2', label: '2a / 2b' },
        { id: '3', label: '3a / 3b' },
        { id: '4', label: '4' }
    ];
    var LAB_RIGHT = [
        { id: '5', label: '5' },
        { id: '6', label: '6' },
        { id: '7', label: '7' },
        { id: '8', label: '8' },
        { id: '9', label: '9' }
    ];
    var LAB_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    function labSum(suffix) {
        var t = 0;
        LAB_IDS.forEach(function (id) {
            var v = parseInt(hcData['pa_lab_' + id + '_' + suffix], 10);
            if (!isNaN(v)) t += v;
        });
        return t;
    }

    function recomputeLaberintos() {
        var atrav = labSum('atrav');
        var camino = labSum('camino');
        hcData['pa_lab_atrav_total'] = String(atrav);
        hcData['pa_lab_camino_total'] = String(camino);
        var a = document.getElementById('hc_pa_lab_atrav_total');
        if (a) a.textContent = atrav;
        var c = document.getElementById('hc_pa_lab_camino_total');
        if (c) c.textContent = camino;
    }

    function labNum(key) {
        return (
            '<input type="number" class="banpe-pa-lab-input" data-hc-key="' + esc(key) + '" value="' +
            esc(val(key)) + '" min="0" />'
        );
    }

    function labErrCell(entry) {
        if (!entry) return '<td></td><td></td>';
        return (
            '<td class="banpe-hc-td-label banpe-pa-lab-name">' + esc(entry.label) + '</td>' +
            '<td class="banpe-pa-lab-err">' +
            '<div class="banpe-pa-lab-line">Atravesar: ' + labNum('pa_lab_' + entry.id + '_atrav') + '</div>' +
            '<div class="banpe-pa-lab-line">Camino sin salida: ' + labNum('pa_lab_' + entry.id + '_camino') + '</div>' +
            '</td>'
        );
    }

    function laberintosHtml() {
        var nRows = Math.max(LAB_LEFT.length, LAB_RIGHT.length);
        var rows = '';
        for (var r = 0; r < nRows; r++) {
            rows += '<tr>' + labErrCell(LAB_LEFT[r]) + labErrCell(LAB_RIGHT[r]) + '</tr>';
        }
        return (
            subHeading('Laberintos (Anexo 4)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “¿Ves este conejo? Tiene mucha hambre y quiere ' +
            'comerse la zanahoria que está del otro lado (señala); tú debes ayudarlo, pero para hacerlo tienes que ' +
            'irte por el centro del camino sin tocar las paredes; tampoco puedes atravesarlas ni meterte a los ' +
            'caminos sin salida. Ahora inténtalo”.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link" data-anexo-open="4">' +
            '<i class="fas fa-image"></i> Anexo 4</button></p>' +
            '<p class="banpe-pa-hint">Registra los errores por laberinto. Los totales se calculan automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-lab-table">' +
            '<thead><tr><th>Laberinto</th><th>Errores</th><th>Laberinto</th><th>Errores</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Total errores atravesar (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_lab_atrav_total">' + labSum('atrav') + '</div></div>' +
                '<div class="banpe-hc-field"><label>Total errores camino sin salida (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_lab_camino_total">' + labSum('camino') + '</div></div>' +
                textField('pa_lab_nivel', 'Nivel')
            ) +
            '</div>'
        );
    }

    function planeacionHtml() {
        return elCarteroHtml() + laberintosHtml();
    }

    /* ---------- 14. Abstracción ---------- */

    function absurdosHtml() {
        var items = COMPR.pa_abs.items;
        var rows = items
            .map(function (label, idx) {
                var i = idx + 1;
                var key = 'pa_abs_' + i;
                return (
                    '<tr>' +
                    '<td class="banpe-hc-td-label"><strong>' + i + '.</strong> ' + esc(label) + '</td>' +
                    '<td>' + cellTextInput(key + '_resp', { placeholder: 'Respuesta del niño' }) + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, '0') + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, '1') + '</td>' +
                    '</tr>'
                );
            })
            .join('');
        var links = '';
        for (var l = 16; l <= 25; l++) {
            links +=
                '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina' +
                l + '"><i class="fas fa-clock"></i> Lámina ' + l + '</button>';
        }
        return (
            subHeading('Absurdos (Láminas 16 a 25)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Preguntar al niño qué hay de raro en este dibujo.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación (pendiente):</p>' +
            '<div class="banpe-anexo-links">' + links + '</div>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada lámina. El total se calcula ' +
            'automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-abs-table">' +
            '<thead>' +
            '<tr><th rowspan="2">Lámina</th><th rowspan="2">Respuesta</th><th colspan="2">Puntuación</th></tr>' +
            '<tr><th>0</th><th>1</th></tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox('pa_abs_total', comprCount('pa_abs', '1'), 10, 'Total')
        );
    }

    function abstraccionHtml() {
        return absurdosHtml();
    }

    /* ---------- 15. Teoría de la mente ---------- */

    function falsaCreenciaContenidoHtml() {
        return (
            subHeading('Falsa creencia de contenido') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> Hacer las siguientes preguntas.</p>' +
            fieldRow(textField('pa_fcc_1', '1. ¿Qué crees que hay adentro de la caja?', { grow: true })) +
            fieldRow(textField('pa_fcc_2', '2. ¿Ahora qué crees que hay adentro de la caja?', { grow: true })) +
            fieldRow(textField('pa_fcc_3', '3. ¿Al principio qué creíste que había adentro de la caja?', { grow: true })) +
            fieldRow(textField('pa_fcc_4', '4. Imagínate que viene tu mamá y ve esta caja. ¿Qué pensará que hay adentro?', { grow: true })) +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(textField('pa_fcc_total', 'Falsa creencia de contenido (0 o 1)', { type: 'number' })) +
            '</div>'
        );
    }

    function falsaCreenciaLugarHtml() {
        return (
            subHeading('Falsa creencia de lugar') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “El angelito está jugando con una pelota, la coloca ' +
            'en la caja azul y se va. Luego viene el diablito y toma la pelota que dejó el angelito, pero ahora la ' +
            'deja en la caja roja y también se va”.</p>' +
            fieldRow(textField('pa_fcl_1', '1. ¿Dónde buscará la pelota el angelito?', { grow: true })) +
            fieldRow(textField('pa_fcl_2', '2. ¿Dónde está la pelota realmente?', { grow: true })) +
            fieldRow(textField('pa_fcl_3', '3. ¿Por qué la buscó ahí el ángel?', { grow: true })) +
            fieldRow(textField('pa_fcl_4', '4. ¿En dónde la guardó el ángel?', { grow: true })) +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(textField('pa_fcl_total', 'Falsa creencia de lugar (0 o 1)', { type: 'number' })) +
            '</div>'
        );
    }

    function teoriaMenteHtml() {
        return falsaCreenciaContenidoHtml() + falsaCreenciaLugarHtml();
    }

    /* ---------- 16. Procesamiento riesgo-beneficio ---------- */

    function eleccionGratificacionHtml() {
        return (
            subHeading('Elección de gratificación') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Como trabajaste muy bien te voy a dar unos dulces, ' +
            'pero me tienes que decir qué prefieres: te puedo dar un dulce en este momento (opción 1) o, si esperas ' +
            'un rato, te doy cuatro (opción 2). ¿Te doy el vaso que tiene un dulce en este momento (1) o te doy el ' +
            'vaso que tiene cuatro si esperas un rato? (2)”. (NO DARLE LOS DULCES).</p>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(textField('pa_riesgo_total', 'Total (máx. 2)', { type: 'number' })) +
            '</div>'
        );
    }

    /* Prueba de juego */

    var JUEGO_COLS = 14;
    var JUEGO_ROWS = [
        { id: 'triste', label: '☹' },
        { id: '1', label: '1' },
        { id: '2', label: '2' }
    ];

    function juegoGridHtml(grid) {
        var rows = JUEGO_ROWS.map(function (row) {
            var cells = '';
            for (var c = 1; c <= JUEGO_COLS; c++) {
                var key = 'pa_juego_' + grid + '_' + row.id + '_' + c;
                cells +=
                    '<td><input type="text" class="banpe-pa-juego-cell" data-hc-key="' + esc(key) + '" value="' +
                    esc(val(key)) + '" /></td>';
            }
            return '<tr><td class="banpe-pa-juego-rowlabel">' + esc(row.label) + '</td>' + cells + '</tr>';
        }).join('');
        return (
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-juego-table"><tbody>' + rows + '</tbody></table>' +
            '</div>'
        );
    }

    function recomputeJuego() {
        var puntos = numVal('pa_juego_puntos');
        var castigos = numVal('pa_juego_castigos');
        var total = puntos - castigos;
        hcData['pa_juego_punt_total'] = String(total);
        var el = document.getElementById('hc_pa_juego_punt_total');
        if (el) el.textContent = total;
    }

    function pruebaJuegoHtml() {
        return (
            subHeading('Prueba de juego') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Tú vas a jugar con estas cartas con caritas felices ' +
            'y yo voy a jugar con éstas. El juego se trata de que por cada carita feliz yo te doy un dulce, pero por ' +
            'cada carita triste tú me regresas un dulce. Tú eliges una carta de las tuyas y yo voy a voltear mi ' +
            'carta que está enfrente de la tuya”.</p>' +
            '<p class="banpe-pa-hint">Registra en cada rejilla las cartas elegidas (fila ☹ caritas tristes, filas 1 ' +
            'y 2 según el tipo de carta).</p>' +
            juegoGridHtml('g1') +
            juegoGridHtml('g2') +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                textField('pa_juego_c1', 'Cartas de una carita', { type: 'number' }) +
                textField('pa_juego_t1', 'Caritas tristes (cartas de una carita)', { type: 'number' })
            ) +
            fieldRow(
                textField('pa_juego_c2', 'Cartas de dos caritas', { type: 'number' }) +
                textField('pa_juego_t2', 'Caritas tristes (cartas de dos caritas)', { type: 'number' })
            ) +
            fieldRow(
                textField('pa_juego_puntos', 'Total puntos', { type: 'number' }) +
                textField('pa_juego_castigos', 'Total castigos', { type: 'number' })
            ) +
            fieldRow(textField('pa_juego_quitaban', '¿Cuáles cartas te quitaban más dulces?', { grow: true })) +
            fieldRow(textField('pa_juego_daban', '¿Cuáles cartas te daban más dulces?', { grow: true })) +
            fieldRow(textField('pa_juego_mejores', '¿Cuáles son las mejores cartas y por qué?', { grow: true })) +
            fieldRow(
                '<div class="banpe-hc-field"><label>Puntuación total (puntos − castigos) (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_juego_punt_total">' +
                (numVal('pa_juego_puntos') - numVal('pa_juego_castigos')) + '</div></div>' +
                textField('pa_juego_pct_riesgo', 'Porcentaje cartas de riesgo')
            ) +
            '</div>'
        );
    }

    function riesgoBeneficioHtml() {
        return eleccionGratificacionHtml() + pruebaJuegoHtml();
    }

    /* ---------- 17. Identificación de emociones ---------- */

    function emocionesTableHtml() {
        var items = COMPR.pa_emo.items;
        var rows = items
            .map(function (label, idx) {
                var i = idx + 1;
                var key = 'pa_emo_' + i;
                return (
                    '<tr>' +
                    '<td class="banpe-hc-td-label">' + esc(label) + '</td>' +
                    '<td>' + cellTextInput(key + '_resp', { placeholder: 'Respuesta del niño' }) + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, '0') + '</td>' +
                    '<td class="banpe-hc-td-opt">' + radioCell(key, '1') + '</td>' +
                    '</tr>'
                );
            })
            .join('');
        return (
            subHeading('Identificación de emociones (Lámina 26)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Dime…”.</p>' +
            '<p class="banpe-pa-hint">Material de aplicación: ' +
            '<button type="button" class="banpe-anexo-link banpe-anexo-link-pending" data-anexo-open="lamina26">' +
            '<i class="fas fa-clock"></i> Lámina 26 (pendiente)</button></p>' +
            '<p class="banpe-pa-hint">Marca 1 (acierto) o 0 (error) por cada emoción. El total se calcula ' +
            'automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-abs-table">' +
            '<thead>' +
            '<tr><th rowspan="2">Pregunta</th><th rowspan="2">Respuesta</th><th colspan="2">Puntuación</th></tr>' +
            '<tr><th>0</th><th>1</th></tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            paTotalBox('pa_emo_total', comprCount('pa_emo', '1'), 5, 'Total')
        );
    }

    function emocionesHtml() {
        return emocionesTableHtml();
    }

    /* Puño-Dedo */

    var PUNODEDO_LEFT = [
        { id: '1', ensayo: '1. Puño' },
        { id: '2', ensayo: '2. Dedo' },
        { id: '3', ensayo: '3. Puño' },
        { id: '4', ensayo: '4. Dedo' },
        { id: '5', ensayo: '5. Dedo' },
        { id: '6', ensayo: '6. Puño' },
        { id: '7', ensayo: '7. Puño' },
        { id: '8', ensayo: '8. Dedo' }
    ];
    var PUNODEDO_RIGHT = [
        { id: '9', ensayo: '9. Puño' },
        { id: '10', ensayo: '10. Dedo' },
        { id: '11', ensayo: '11. Dedo' },
        { id: '12', ensayo: '12. Dedo' },
        { id: '13', ensayo: '13. Puño' },
        { id: '14', ensayo: '14. Dedo' },
        { id: '15', ensayo: '15. Puño' },
        { id: '16', ensayo: '16. Puño' }
    ];

    function punoDedoCount(value) {
        var n = 0;
        PUNODEDO_LEFT.concat(PUNODEDO_RIGHT).forEach(function (it) {
            if (hcData['pa_pd_' + it.id] === value) n++;
        });
        return n;
    }

    function punoDedoTotal() {
        var t = 0;
        PUNODEDO_LEFT.concat(PUNODEDO_RIGHT).forEach(function (it) {
            var v = parseInt(hcData['pa_pd_' + it.id], 10);
            if (!isNaN(v)) t += v;
        });
        return t;
    }

    function recomputePunoDedo() {
        var aciertos = punoDedoCount('2');
        var parcial = punoDedoCount('1');
        var total = punoDedoTotal();
        hcData['pa_pd_aciertos'] = String(aciertos);
        hcData['pa_pd_parcial'] = String(parcial);
        hcData['pa_pd_total'] = String(total);
        var a = document.getElementById('hc_pa_pd_aciertos');
        if (a) a.textContent = aciertos;
        var p = document.getElementById('hc_pa_pd_parcial');
        if (p) p.textContent = parcial;
        var tl = document.getElementById('hc_pa_pd_total');
        if (tl) tl.textContent = total;
    }

    function punoDedoCells(item) {
        var key = 'pa_pd_' + item.id;
        return (
            '<td class="banpe-hc-td-label">' + esc(item.ensayo) + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '0') + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '1') + '</td>' +
            '<td class="banpe-hc-td-opt">' + radioCell(key, '2') + '</td>'
        );
    }

    function punoDedoHtml() {
        var rows = '';
        for (var i = 0; i < PUNODEDO_LEFT.length; i++) {
            rows +=
                '<tr>' +
                punoDedoCells(PUNODEDO_LEFT[i]) +
                punoDedoCells(PUNODEDO_RIGHT[i]) +
                '</tr>';
        }
        var headOpts =
            '<th>error<br><span>0</span></th><th>parcial<br><span>1</span></th>' +
            '<th>acierto<br><span>2</span></th>';
        return (
            subHeading('Puño-Dedo') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Enséñame tu puño; ahora tu dedo. Vamos a jugar al ' +
            'revés. Cuando yo te enseñe el dedo tienes que enseñarme el puño, y cuando te muestre el puño tú me ' +
            'tienes que mostrar el dedo”.</p>' +
            '<p class="banpe-pa-hint">Puntúa cada ensayo: 0 error, 1 parcial, 2 acierto. Aciertos, movimiento ' +
            'parcial y total se calculan automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-pd-table">' +
            '<thead>' +
            '<tr><th rowspan="2">Ensayo</th><th colspan="3">Puntuación</th>' +
            '<th rowspan="2">Ensayo</th><th colspan="3">Puntuación</th></tr>' +
            '<tr>' + headOpts + headOpts + '</tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            fieldRow(
                '<div class="banpe-hc-field"><label>Aciertos (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_pd_aciertos">' + punoDedoCount('2') + '</div></div>' +
                '<div class="banpe-hc-field"><label>Movimiento parcial (automático)</label>' +
                '<div class="banpe-pa-computed" id="hc_pa_pd_parcial">' + punoDedoCount('1') + '</div></div>'
            ) +
            paTotalBox('pa_pd_total', punoDedoTotal(), 32, 'Total') +
            '</div>'
        );
    }

    function stroopDiaNocheHtml() {
        var rows = '';
        for (var i = 0; i < STROOPDN_LEFT.length; i++) {
            rows +=
                '<tr>' +
                stroopDnRowCells(STROOPDN_LEFT[i]) +
                stroopDnRowCells(STROOPDN_RIGHT[i]) +
                '</tr>';
        }
        return (
            subHeading('Stroop Día-Noche') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “¿Vamos a jugar al revés? Cuando veas la luna tienes ' +
            'que decir ‘día’, y cuando te muestre el sol tienes que decir ‘noche’”. Llevar a cabo el ejemplo; si ' +
            'acierta, iniciar con el primer ensayo. En caso de que el niño dé otra respuesta, realizar el siguiente ' +
            'ejemplo; si acierta, iniciar con el primer ensayo.</p>' +
            '<p class="banpe-pa-hint">Los ejemplos (E1 y E2) no suman. Marca 1 (acierto) o 0 (error) por cada ' +
            'ensayo. Los aciertos se calculan automáticamente.</p>' +
            '<div class="banpe-hc-table-wrap">' +
            '<table class="banpe-hc-table banpe-pa-dn-table">' +
            '<thead>' +
            '<tr><th rowspan="2">Ensayo</th><th rowspan="2">Respuesta esperada</th><th colspan="2">Puntuación</th>' +
            '<th rowspan="2">Ensayo</th><th rowspan="2">Respuesta esperada</th><th colspan="2">Puntuación</th></tr>' +
            '<tr><th>0</th><th>1</th><th>0</th><th>1</th></tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>' +
            '<div class="banpe-pa-mcv-metrics">' +
            paTotalBox('pa_dn_aciertos', stroopDnAciertos(), 16, 'Aciertos') +
            fieldRow(textField('pa_dn_tiempo', 'Tiempo')) +
            '</div>'
        );
    }

    function numVal(key) {
        var n = parseInt(hcData[key], 10);
        return isNaN(n) ? 0 : n;
    }

    function aiTotal(prefix) {
        return numVal(prefix + '_aciertos') - numVal(prefix + '_intrusiones');
    }

    function recomputeAiTotal(prefix) {
        var t = aiTotal(prefix);
        hcData[prefix + '_total'] = String(t);
        var el = document.getElementById('hc_' + prefix + '_total');
        if (el) el.textContent = t;
    }

    function cancelacionVisualHtml() {
        return (
            subHeading('Cancelación visual (Anexo 1)') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Marca así todas las figuras que sean iguales a ésta ' +
            '(se marca con una cruz una estrella de cinco picos ★). Tienes que hacerlo lo más rápido que puedas” ' +
            '(tiempo límite 60 seg).</p>' +
            '<p class="banpe-pa-hint">Consulta las láminas de figuras en el ' +
            '<button type="button" class="banpe-anexo-link" data-anexo-open="1">' +
            '<i class="fas fa-image"></i> Anexo 1</button> (se abre en un visor).</p>' +
            '<div class="banpe-pa-cancel">' +
            fieldRow(
                textField('pa_canc_aciertos', 'Aciertos', { type: 'number' }) +
                textField('pa_canc_intrusiones', 'Intrusiones', { type: 'number' })
            ) +
            paTotalBox('pa_canc_total', aiTotal('pa_canc'), 24, 'Total (A − I)') +
            '</div>'
        );
    }

    var DET_GRID = [
        [3, 9, 2, 5, 1, 2, 4, 7, 1, 2, 5, 3, 5],
        [7, 8, 2, 5, 1, 3, 9, 4, 7, 2, 6, 9, 3],
        [2, 7, 3, 8, 5, 7, 6, 2, 5, 8, 3, 9, 6],
        [7, 2, 5, 1, 6, 3, 8, 4, 9, 1, 3, 6, 2],
        [4, 7, 3, 9, 1, 2, 5, 2, 1, 8, 5, 3, 5],
        [1, 2, 7, 6, 5, 4, 3, 8, 2, 9, 4, 1, 6]
    ];

    function deteccionDigitosHtml() {
        var rows = DET_GRID.map(function (row, idx) {
            var cells = row
                .map(function (n) {
                    return '<span class="banpe-pa-det-cell' + (n === 2 ? ' banpe-pa-det-target' : '') + '">' + n + '</span>';
                })
                .join('');
            return (
                '<div class="banpe-pa-det-row">' +
                '<span class="banpe-pa-det-arrow">' + (idx === 0 ? '➜' : '') + '</span>' +
                cells +
                '</div>'
            );
        }).join('');
        return (
            subHeading('Detección de dígitos') +
            '<p class="banpe-pa-instr"><em>Instrucciones:</em> “Voy a leer unos números, y cada vez que escuches ' +
            'el 2 darás un golpecito en la mesa”. Iniciar ejemplo. Después de leer el ejemplo y asegurarse de que ' +
            'el niño ha comprendido la instrucción, comenzar: “Voy a leer otros números. Recuerda, cada vez que ' +
            'escuches el 2 darás un golpecito en la mesa”. Leer los números en secuencia horizontal.</p>' +
            '<p class="banpe-pa-hint">Lee los números en secuencia horizontal (el objetivo es el “2”, resaltado). ' +
            'Registra los aciertos e intrusiones observados.</p>' +
            '<div class="banpe-pa-det-grid">' + rows + '</div>' +
            '<div class="banpe-pa-cancel">' +
            fieldRow(
                textField('pa_det_aciertos', 'Aciertos', { type: 'number' }) +
                textField('pa_det_intrusiones', 'Intrusiones', { type: 'number' })
            ) +
            paTotalBox('pa_det_total', aiTotal('pa_det'), 10, 'Total (A − I)') +
            '</div>'
        );
    }

    function sectionContentHtml(sectionId) {
        if (sectionId === 'historia') return sectionHistoriaHtml();
        if (sectionId === 'signos') return sectionSignosHtml();
        if (sectionId === 'protocolo') return sectionProtocoloHtml();
        return '';
    }

    /* ---------- Render ---------- */

    function renderTabs() {
        var tabs = SECTIONS.map(function (s) {
            var isActive = s.id === activeSection ? ' banpe-apply-tab-active' : '';
            return (
                '<button type="button" class="btn btn-outline-secondary btn-sm banpe-apply-tab' + isActive +
                '" data-apply-section="' + esc(s.id) + '">' +
                esc(s.label) +
                '</button>'
            );
        });
        return '<div class="banpe-apply-tabs" role="tablist">' + tabs.join('') + '</div>';
    }

    function renderBody() {
        var body = document.getElementById('banpeApplyModalBody');
        if (!body) return;
        body.innerHTML =
            renderTabs() +
            '<div class="banpe-apply-content" id="banpeApplyContent">' +
            sectionContentHtml(activeSection) +
            '</div>';
    }

    var ANEXOS = {
        '1': {
            title: 'Anexo 1 — Cancelación visual',
            images: ['/static/anexos/anexo1_lamina1.png', '/static/anexos/anexo1_lamina2.png']
        },
        '2': {
            title: 'Anexo 2 — Coordinación motora fina',
            images: ['/static/anexos/anexo2.png']
        },
        '3': {
            title: 'Anexo 3 — Coordinación motora fina',
            images: ['/static/anexos/anexo3_1.png', '/static/anexos/anexo3_2.png']
        },
        '4': {
            title: 'Anexo 4 — Laberintos',
            images: ['/static/anexos/anexo4.png', '/static/anexos/anexo4_2.png']
        },
        lamina1: {
            title: 'Lámina 1 — Búsqueda visual',
            images: []
        },
        lamina13: {
            title: 'Lámina 13 — Cubos en progresión',
            images: []
        },
        lamina2: { title: 'Lámina 2 — Curva de memoria visual', images: [] },
        lamina3: { title: 'Lámina 3 — Curva de memoria visual', images: [] },
        lamina4: { title: 'Lámina 4 — Curva de memoria visual', images: [] },
        lamina5: { title: 'Lámina 5 — Curva de memoria visual', images: [] },
        lamina6: { title: 'Lámina 6 — Comprensión de verbos', images: [] },
        lamina7: { title: 'Lámina 7 — Reconocimiento de colores', images: [] },
        lamina8: { title: 'Lámina 8 — Comprensión de instrucciones', images: [] },
        lamina9: { title: 'Lámina 9 — Comprensión del plural', images: [] },
        lamina10: { title: 'Lámina 10 — Comprensión del plural', images: [] },
        lamina11: { title: 'Lámina 11 — Identificación de letras y números', images: [] },
        lamina12: { title: 'Lámina 12 — Conteo', images: [] },
        lamina14: { title: 'Lámina 14 — Repartiendo leche', images: [] },
        lamina15: { title: 'Lámina 15 — Categorización A', images: [] },
        lamina16: { title: 'Lámina 16 — Absurdos', images: [] },
        lamina17: { title: 'Lámina 17 — Absurdos', images: [] },
        lamina18: { title: 'Lámina 18 — Absurdos', images: [] },
        lamina19: { title: 'Lámina 19 — Absurdos', images: [] },
        lamina20: { title: 'Lámina 20 — Absurdos', images: [] },
        lamina21: { title: 'Lámina 21 — Absurdos', images: [] },
        lamina22: { title: 'Lámina 22 — Absurdos', images: [] },
        lamina23: { title: 'Lámina 23 — Absurdos', images: [] },
        lamina24: { title: 'Lámina 24 — Absurdos', images: [] },
        lamina25: { title: 'Lámina 25 — Absurdos', images: [] },
        lamina26: { title: 'Lámina 26 — Identificación de emociones', images: [] }
    };

    function showAnexoViewer(anexoId) {
        var anexo = ANEXOS[anexoId];
        if (!anexo) return;
        var ov = document.getElementById('banpeAnexoViewer');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'banpeAnexoViewer';
            ov.className = 'banpe-anexo-viewer';
            document.body.appendChild(ov);
            ov.addEventListener('click', function (e) {
                if (
                    (e.target.closest && e.target.closest('.banpe-anexo-close')) ||
                    e.target.classList.contains('banpe-anexo-backdrop')
                ) {
                    ov.style.display = 'none';
                }
            });
        }
        ov.innerHTML =
            '<div class="banpe-anexo-backdrop"></div>' +
            '<div class="banpe-anexo-content">' +
            '<div class="banpe-anexo-head">' +
            '<span>' + esc(anexo.title) + '</span>' +
            '<button type="button" class="banpe-anexo-close" aria-label="Cerrar">&times;</button>' +
            '</div>' +
            '<div class="banpe-anexo-body">' +
            (anexo.images && anexo.images.length
                ? anexo.images
                      .map(function (src, i) {
                          return '<img src="' + esc(src) + '" alt="' + esc(anexo.title + ' (lámina ' + (i + 1) + ')') + '" />';
                      })
                      .join('')
                : '<div class="banpe-anexo-pending"><i class="fas fa-clock"></i>' +
                  '<p>Esta lámina aún no está disponible. Se cargará más adelante.</p></div>') +
            '</div>' +
            '</div>';
        ov.style.display = 'flex';
    }

    function attachDelegatedListeners() {
        var body = document.getElementById('banpeApplyModalBody');
        if (!body || body.__banpeApplyBound) return;
        body.__banpeApplyBound = true;

        var updateFromEvent = function (t) {
            if (t && t.getAttribute && t.hasAttribute('data-hc-key')) {
                var k = t.getAttribute('data-hc-key');
                if (t.type === 'checkbox') {
                    hcData[k] = t.checked ? (t.value || '1') : '';
                } else {
                    hcData[k] = t.value;
                }
            }
        };
        var handleDerived = function (key) {
            if (!key) return;
            if (/^pa_o[1-8]$/.test(key)) recomputeOrientacionTotal();
            else if (/^sn_\d+$/.test(key)) syncSnSb(key);
            else if (/^sn_(7|8)[a-d]$/.test(key)) syncSnTonoSb();
            else if (/^pa_dig_E[12]_\d+$/.test(key)) recomputeDigSpanTotal('pa_dig');
            else if (/^pa_cubos_E[12]_\d+$/.test(key)) recomputeDigSpanTotal('pa_cubos');
            else if (/^pa_cubosreg_E[12]_\d+$/.test(key)) recomputeDigSpanTotal('pa_cubosreg');
            else if (/^pa_digreg_E[12]_\d+$/.test(key)) recomputeDigSpanTotal('pa_digreg');
            else if (/^(pa_canc|pa_det)_(aciertos|intrusiones)$/.test(key)) {
                recomputeAiTotal(key.replace(/_(aciertos|intrusiones)$/, ''));
            } else if (/^pa_bv_/.test(key)) recomputeBusquedaVisual();
            else if (/^pa_mcv_(\w+)_t[123]$/.test(key)) recomputeMemCurve('pa_mcv');
            else if (/^pa_mvv_(\w+)_t[123]$/.test(key)) recomputeMemCurve('pa_mvv');
            else if (/^pa_eve_(gato|pera|mano|fresa|vaca|codo)$/.test(key)) recomputeEveEsp();
            else if (/^pa_clave_(gato|pera|mano|fresa|vaca|codo)$/.test(key)) recomputeEveClave();
            else if (/^pa_rec_(boca|lapiz|gato|zorro|cama|mano|pera|fresa|codo|ceja|arbol|vaca|gallo|flor)$/.test(key)) {
                recomputeReconocimiento();
            } else if (/^pa_recvis_/.test(key)) recomputeRecVis();
            else if (/^pa_idc_\d+$/.test(key)) recomputeCompr('pa_idc');
            else if (/^pa_prep_\d+$/.test(key)) recomputeCompr('pa_prep');
            else if (/^pa_verb_\d+$/.test(key)) recomputeCompr('pa_verb');
            else if (/^pa_col_(azul|verde|rojo|amarillo)_(den|emp)$/.test(key)) recomputeColores();
            else if (/^pa_instr_\d+$/.test(key)) recomputeCompr('pa_instr');
            else if (/^pa_plural_\d+$/.test(key)) recomputeCompr('pa_plural');
            else if (/^pa_compl_\d+$/.test(key)) recomputeCompr('pa_compl');
            else if (/^pa_opue_\d+$/.test(key)) recomputeCompr('pa_opue');
            else if (/^pa_flu_\d+$/.test(key)) recomputeFluidez();
            else if (/^pa_oro_\d+$/.test(key)) recomputeSumTable('pa_oro');
            else if (/^pa_fon_\d+$/.test(key)) recomputeCompr('pa_fon');
            else if (/^pa_cmg_\d+$/.test(key)) recomputeSumTable('pa_cmg');
            else if (/^pa_cmf_\d+$/.test(key)) recomputeSumTable('pa_cmf');
            else if (/^pa_iln_(n[1-5]|l[aeiou])$/.test(key)) recomputeIln();
            else if (/^pa_arit_\d+$/.test(key)) recomputeCompr('pa_arit');
            else if (/^pa_cont_\d+$/.test(key)) recomputeCompr('pa_cont');
            else if (/^pa_stroop_(\d+|e[12])$/.test(key)) recomputeStroop();
            else if (/^pa_dn_(\d+|e[12])$/.test(key)) recomputeStroopDn();
            else if (/^pa_pd_\d+$/.test(key)) recomputePunoDedo();
            else if (/^pa_leche_(E[12]_\d+|ej)$/.test(key)) recomputeProgVert('pa_leche', LECHE.levels);
            else if (/^pa_cartero_(E[12]_\d+|ej)$/.test(key)) recomputeProgVert('pa_cartero', CARTERO.levels);
            else if (/^pa_lab_\d+_(atrav|camino)$/.test(key)) recomputeLaberintos();
            else if (/^pa_abs_\d+$/.test(key)) recomputeCompr('pa_abs');
            else if (/^pa_emo_\d+$/.test(key)) recomputeCompr('pa_emo');
            else if (key === 'pa_juego_puntos' || key === 'pa_juego_castigos') recomputeJuego();
        };
        body.addEventListener('input', function (e) {
            updateFromEvent(e.target);
            if (e.target && e.target.getAttribute) handleDerived(e.target.getAttribute('data-hc-key') || '');
        });
        body.addEventListener('change', function (e) {
            updateFromEvent(e.target);
            if (e.target && e.target.getAttribute) handleDerived(e.target.getAttribute('data-hc-key') || '');
        });

        body.addEventListener('click', function (e) {
            var tab = e.target.closest ? e.target.closest('.banpe-apply-tab') : null;
            if (tab) {
                var id = tab.getAttribute('data-apply-section');
                if (id && id !== activeSection) {
                    activeSection = id;
                    renderBody();
                }
                return;
            }
            var anexo = e.target.closest ? e.target.closest('[data-anexo-open]') : null;
            if (anexo) {
                e.preventDefault();
                showAnexoViewer(anexo.getAttribute('data-anexo-open'));
                return;
            }
            var toggle = e.target.closest ? e.target.closest('[data-expander-toggle]') : null;
            if (toggle) {
                var exId = toggle.getAttribute('data-expander-toggle');
                openExpanders[exId] = !openExpanders[exId];
                renderBody();
            }
        });
    }

    function ensureModalBuilt() {
        if (document.getElementById(MODAL_ID)) return;
        var modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'banpe-apply-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        modal.innerHTML =
            '<div class="banpe-apply-header">' +
            '<h3 id="banpeApplyModalTitle"><i class="fas fa-vial"></i> Aplicar Prueba BANPE</h3>' +
            '<div class="banpe-apply-header-actions">' +
            '<button type="button" class="btn btn-success btn-sm" onclick="banpeApplySaveChanges()">' +
            'Guardar cambios</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" onclick="closeBanpeApplyModal()">' +
            'Cerrar</button>' +
            '</div>' +
            '</div>' +
            '<div class="banpe-apply-body" id="banpeApplyModalBody"></div>';
        document.body.appendChild(modal);
    }

    /* ---------- Hooks de persistencia (llamados por banpe.js) ---------- */

    window.banpeApplyCollectData = function () {
        return { version: 1, historiaClinica: hcData };
    };

    window.banpeApplyLoadData = function (data) {
        if (data && typeof data === 'object' && data.historiaClinica && typeof data.historiaClinica === 'object') {
            hcData = data.historiaClinica;
        } else {
            hcData = {};
        }
        if (document.getElementById(MODAL_ID) && document.getElementById(MODAL_ID).style.display !== 'none') {
            renderBody();
        }
    };

    /* ---------- API pública del modal ---------- */

    window.openBanpeApplyModal = function () {
        var reg = document.getElementById('banpeRegistrationPanel');
        if (!reg || reg.style.display === 'none') {
            if (typeof showToast === 'function') {
                showToast('Abra el formulario de registro BANPE para aplicar la prueba.', 'info');
            }
            return;
        }
        ensureModalBuilt();

        if (typeof window.banpeGetHistoriaClinicaDefaults === 'function') {
            prefillDefaults(window.banpeGetHistoriaClinicaDefaults());
        }

        var modal = document.getElementById(MODAL_ID);
        if (!modal) return;

        var title = document.getElementById('banpeApplyModalTitle');
        var pid = '';
        var pidEl = document.getElementById('banpeRegPatientId');
        if (pidEl && pidEl.value) pid = pidEl.value.trim();
        if (title) {
            title.innerHTML =
                '<i class="fas fa-vial"></i> Aplicar Prueba BANPE' +
                (pid ? ' — <span class="banpe-apply-pid">' + esc(pid) + '</span>' : '');
        }

        renderBody();
        attachDelegatedListeners();
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');

        if (escKeyHandler) document.removeEventListener('keydown', escKeyHandler);
        escKeyHandler = function (e) {
            if (e.key === 'Escape') window.closeBanpeApplyModal();
        };
        document.addEventListener('keydown', escKeyHandler);
    };

    window.closeBanpeApplyModal = function () {
        var modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (escKeyHandler) {
            document.removeEventListener('keydown', escKeyHandler);
            escKeyHandler = null;
        }
    };

    /* Guarda usando el mismo flujo del registro BANPE, permaneciendo en el modal. */
    window.banpeApplySaveChanges = function () {
        if (typeof window.saveBanpeRegistrationDraft === 'function') {
            window.saveBanpeRegistrationDraft({ keepOpen: true });
        }
    };
})();
