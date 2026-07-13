/**
 * Mediación exploratoria — exposición materna → IMC → triglicéridos (bootstrap).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let medSchema = null;

    function getDatasetId() {
        const ds = App().state.activeDataset;
        return ds && ds.id ? ds.id : null;
    }

    async function parseResponse(res) {
        const text = await res.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (e) {
            throw new Error(
                res.ok
                    ? 'Respuesta inválida del servidor'
                    : 'Error ' + res.status + ' — reinicie el servidor si acaba de actualizar el código'
            );
        }
        if (!res.ok) {
            throw new Error(data.detail || data.message || 'Error en la solicitud');
        }
        return data;
    }

    async function apiGet(path) {
        return parseResponse(await fetch(API() + path));
    }

    async function apiPost(path, body) {
        return parseResponse(
            await fetch(API() + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {})
            })
        );
    }

    function formatP(p) {
        if (p == null || p === '') return '—';
        if (typeof p === 'number' && p < 0.001) return '<0.001';
        return String(p);
    }

    function showStep(step) {
        const setup = document.getElementById('medStepSetup');
        const results = document.getElementById('medStepResults');
        if (setup) setup.hidden = step !== 'setup';
        if (results) results.hidden = step !== 'results';
    }

    function resetMediation() {
        showStep('setup');
        const mount = document.getElementById('medResultsMount');
        if (mount) mount.innerHTML = '';
    }

    function fillExposureSelect(schema) {
        const sel = document.getElementById('medExposure');
        if (!sel) return;
        const exposures = schema.exposures || [];
        sel.innerHTML = exposures
            .map(function (e) {
                const disabled = !e.available;
                let extra = '';
                if (e.note) extra = ' — ' + e.note;
                else if (e.available) {
                    const n = e.n_complete != null ? e.n_complete : e.n_valid;
                    extra = ' (n=' + n + ', Sí=' + e.n_yes + ', No=' + e.n_no + ')';
                }
                return (
                    '<option value="' +
                    App().escapeHtml(e.id) +
                    '"' +
                    (disabled ? ' disabled' : '') +
                    '>' +
                    App().escapeHtml(e.label) +
                    App().escapeHtml(extra) +
                    '</option>'
                );
            })
            .join('');
        var pick =
            exposures.find(function (e) {
                return e.id === schema.default_exposure_id && e.available;
            }) ||
            exposures.find(function (e) {
                return e.available;
            });
        if (pick) sel.value = pick.id;
    }

    function updateHypothesisFromSelection() {
        const sel = document.getElementById('medExposure');
        const hyp = document.getElementById('medHypothesisText');
        if (!sel || !hyp || !medSchema) return;
        const opt = (medSchema.exposures || []).find(function (e) {
            return e.id === sel.value;
        });
        if (opt && opt.available) {
            hyp.textContent =
                'Hipótesis: el efecto de ' +
                opt.label +
                ' sobre los triglicéridos del niño está mediado parcialmente por el IMC actual.';
            hyp.classList.remove('analysis-infer-fail');
        } else if (opt) {
            hyp.textContent = opt.note || 'Exposición no utilizable para mediación.';
            hyp.classList.add('analysis-infer-fail');
        }
    }

    function renderVariables(schema) {
        const mount = document.getElementById('medVariablesMount');
        if (!mount) return;
        const sel = document.getElementById('medExposure');
        const exp = (schema.exposures || []).find(function (e) {
            return e.id === (sel && sel.value);
        });
        const med = schema.mediator || {};
        const out = schema.outcome || {};
        const minN = schema.min_n || 40;
        const rows = [
            {
                role: 'X (exposición)',
                label: exp ? exp.label : '—',
                column: exp ? exp.column : '—',
                n_valid: exp ? exp.n_valid : 0,
                ok: exp && exp.available,
                n_show: exp ? exp.n_complete != null ? exp.n_complete : exp.n_valid : 0
            },
            {
                role: 'M (mediador)',
                label: med.label || 'IMC',
                column: med.column || '—',
                n_valid: med.n_valid || 0,
                ok: (med.n_valid || 0) >= minN
            },
            {
                role: 'Y (resultado)',
                label: out.label || 'Triglicéridos',
                column: out.column || '—',
                n_valid: out.n_valid || 0,
                ok: !!out.column
            }
        ];
        mount.innerHTML =
            '<div class="analysis-table-wrap"><table class="analysis-data-table analysis-avanz-med-vars">' +
            '<thead><tr><th>Rol</th><th>Variable</th><th>Columna</th><th>n válido</th></tr></thead><tbody>' +
            rows
                .map(function (v) {
                    return (
                        '<tr><td>' +
                        App().escapeHtml(v.role) +
                        '</td><td>' +
                        App().escapeHtml(v.label) +
                        '</td><td>' +
                        App().escapeHtml(v.column || '—') +
                        '</td><td class="' +
                        (v.ok ? 'analysis-infer-ok' : 'analysis-infer-fail') +
                        '">' +
                        (v.n_show != null ? v.n_show : v.n_valid != null ? v.n_valid : '—') +
                        '</td></tr>'
                    );
                })
                .join('') +
            '</tbody></table></div>';
        if (!schema.ready) {
            mount.innerHTML +=
                '<p class="analysis-infer-stat-line analysis-infer-fail">Ningún antecedente materno tiene variación Sí/No con casos completos (exposición + IMC + triglicéridos). Mínimo ' +
                (schema.min_n || 25) +
                ' casos.</p>';
        } else if (exp && exp.exploratory) {
            mount.innerHTML +=
                '<p class="analysis-infer-stat-line">Muestra pequeña: resultados exploratorios (ideal n≥' +
                (schema.min_n_recommended || 40) +
                ').</p>' +
                mount.innerHTML;
        }
    }

    function updateRunButton() {
        const btn = document.getElementById('medRunBtn');
        const sel = document.getElementById('medExposure');
        if (!btn || !sel || !medSchema) return;
        const opt = (medSchema.exposures || []).find(function (e) {
            return e.id === sel.value;
        });
        btn.disabled = !(medSchema.ready && opt && opt.available);
    }

    function renderPathDiagram(paths, effects, data) {
        const path = paths || {};
        const indirect = (effects || []).find(function (e) {
            return e.symbol === 'ab';
        });
        const direct = (effects || []).find(function (e) {
            return e.symbol === "c′";
        });
        const indSig = indirect && indirect.ci && indirect.ci.significant;
        const dirSig = direct && direct.ci && direct.ci.significant;
        const pa = path.a || {};
        const pb = path.b || {};
        const pc = path.c_prime || {};
        const xLabel = (data && data.exposure_short) || 'X';
        const xTitle = (data && data.exposure_label) || 'Exposición materna';

        return (
            '<div class="analysis-avanz-med-diagram" aria-label="Diagrama de mediación">' +
            '<div class="med-flow">' +
            '<div class="med-node med-node-x"><span>' +
            App().escapeHtml(xLabel) +
            '</span><small>' +
            App().escapeHtml(xTitle) +
            '</small></div>' +
            '<div class="med-path med-path-a"><span>a = ' +
            App().escapeHtml(String(pa.estimate != null ? pa.estimate : '—')) +
            '</span><small>p ' +
            App().escapeHtml(pa.p || '—') +
            '</small></div>' +
            '<div class="med-node med-node-m"><span>IMC</span><small>Mediador actual</small></div>' +
            '<div class="med-path med-path-b"><span>b = ' +
            App().escapeHtml(String(pb.estimate != null ? pb.estimate : '—')) +
            '</span><small>p ' +
            App().escapeHtml(pb.p || '—') +
            '</small></div>' +
            '<div class="med-node med-node-y"><span>Triglicéridos</span><small>Niño</small></div>' +
            '</div>' +
            '<div class="med-path-extra">' +
            '<span class="med-path med-path-cprime' +
            (dirSig ? ' med-path--sig' : '') +
            '">c′ directo = ' +
            App().escapeHtml(String(pc.estimate != null ? pc.estimate : '—')) +
            ' (programación fetal / vía no mediada)</span>' +
            '<span class="med-path med-path-indirect' +
            (indSig ? ' med-path--sig' : '') +
            '">Indirecto a×b = ' +
            App().escapeHtml(String(indirect && indirect.estimate != null ? indirect.estimate : '—')) +
            ' (vía IMC / transmisión posnatal)</span>' +
            '</div></div>'
        );
    }

    function renderEffectsTable(effects) {
        let h =
            '<p class="analysis-infer-table-title">Efectos de mediación (bootstrap)</p>' +
            '<div class="analysis-table-wrap"><table class="analysis-data-table">' +
            '<thead><tr><th>Efecto</th><th>Estimación</th><th>IC 95% bootstrap</th><th>p (bootstrap)</th><th>Interpretación</th></tr></thead><tbody>';
        (effects || []).forEach(function (row) {
            const sig = row.ci && row.ci.significant;
            h +=
                '<tr class="' +
                (sig ? 'analysis-avanz-med-row-sig' : '') +
                '"><td><strong>' +
                App().escapeHtml(row.effect) +
                '</strong><br><span class="med-symbol">' +
                App().escapeHtml(row.symbol) +
                '</span></td><td>' +
                App().escapeHtml(row.estimate == null ? '—' : String(row.estimate)) +
                '</td><td>' +
                App().escapeHtml((row.ci && row.ci.display) || '—') +
                '</td><td>' +
                formatP(row.p_bootstrap) +
                '</td><td>' +
                App().escapeHtml(row.description || '') +
                '</td></tr>';
        });
        return h + '</tbody></table></div>';
    }

    function plotEffectsBar(chartId, effects) {
        if (!window.Plotly || !effects || !effects.length) return;
        const labels = effects.map(function (e) {
            return e.symbol;
        });
        const vals = effects.map(function (e) {
            return e.estimate;
        });
        const colors = ['#6366f1', '#2563eb', '#7c3aed'];
        const errPlus = effects.map(function (e, i) {
            if (!e.ci || e.ci.hi == null || e.estimate == null) return 0;
            return Math.max(0, e.ci.hi - e.estimate);
        });
        const errMinus = effects.map(function (e) {
            if (!e.ci || e.ci.lo == null || e.estimate == null) return 0;
            return Math.max(0, e.estimate - e.ci.lo);
        });
        Plotly.newPlot(
            chartId,
            [
                {
                    type: 'bar',
                    x: labels,
                    y: vals,
                    marker: { color: colors },
                    error_y: {
                        type: 'data',
                        symmetric: false,
                        array: errPlus,
                        arrayminus: errMinus,
                        color: '#0f172a'
                    },
                    text: vals.map(function (v) {
                        return v == null ? '' : String(v);
                    }),
                    textposition: 'outside'
                }
            ],
            {
                title: 'Efectos total, directo e indirecto',
                yaxis: { title: 'Coeficiente (unidades de Y)' },
                margin: { t: 44, b: 48, l: 56, r: 16 },
                height: 320,
                shapes: [{ type: 'line', x0: -0.5, x1: 2.5, y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dot' } }]
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderResults(data) {
        const mount = document.getElementById('medResultsMount');
        if (!mount) return;
        const chartId = 'medEffectsChart-' + Date.now();
        const insight = data.insight || {};
        const paths = data.paths || {};

        let html =
            '<div class="analysis-infer-summary-vars"><strong>Exposición:</strong> ' +
            App().escapeHtml(data.exposure_label || '') +
            ' · <strong>n=</strong>' +
            data.n +
            ' (Sí=' +
            (data.n_exposure_yes != null ? data.n_exposure_yes : '—') +
            ', No=' +
            (data.n_exposure_no != null ? data.n_exposure_no : '—') +
            ') · <strong>Bootstrap:</strong> ' +
            (data.bootstrap && data.bootstrap.replications) +
            ' réplicas</div>';

        html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(data.hypothesis || '') + '</p>';
        if (data.small_sample_warning) {
            html +=
                '<p class="analysis-infer-stat-line analysis-avanz-caveat"><em>Muestra pequeña (n&lt;40): intervalos bootstrap muy amplios; interpretación solo exploratoria.</em></p>';
        }
        html += renderPathDiagram(paths, data.effects, data);
        html += '<div id="' + chartId + '" class="analysis-avanz-chart"></div>';
        html += renderEffectsTable(data.effects);

        if (data.proportion_mediated != null) {
            html +=
                '<p class="analysis-infer-stat-line"><strong>Proporción mediada:</strong> ' +
                App().escapeHtml(String(data.proportion_mediated)) +
                '% — ' +
                App().escapeHtml(data.proportion_mediated_note || '') +
                '</p>';
        }

        if (data.sobel && data.sobel.p_value != null) {
            html +=
                '<p class="analysis-infer-stat-line"><strong>Prueba de Sobel (indirecto):</strong> z=' +
                App().escapeHtml(String(data.sobel.z)) +
                ', p=' +
                formatP(data.sobel.p_value) +
                ' (complementaria al bootstrap)</p>';
        }

        html += '<div class="analysis-avanz-insight"><h4>' + App().escapeHtml(insight.title || 'Insight') + '</h4>';
        (insight.paragraphs || []).forEach(function (p) {
            html += '<p>' + App().escapeHtml(p) + '</p>';
        });
        html += '</div>';

        html +=
            '<details class="analysis-avanz-med-models"><summary>Modelos estimados</summary><ul>' +
            '<li>' +
            App().escapeHtml((data.models && data.models.path_a) || '') +
            '</li><li>' +
            App().escapeHtml((data.models && data.models.path_bc) || '') +
            '</li><li>' +
            App().escapeHtml((data.models && data.models.total) || '') +
            '</li></ul></details>';

        html +=
            '<p class="analysis-infer-stat-line analysis-avanz-caveat"><em>' +
            App().escapeHtml(data.caveat || '') +
            '</em></p>';

        mount.innerHTML = html;
        plotEffectsBar(chartId, data.effects);
        showStep('results');
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) {
            medSchema = null;
            return;
        }
        try {
            medSchema = await apiGet('/datasets/' + encodeURIComponent(id) + '/avanzado/mediation/schema');
            const method = document.getElementById('medMethodNote');
            if (method && medSchema.method_note) method.textContent = medSchema.method_note;
            fillExposureSelect(medSchema);
            updateHypothesisFromSelection();
            renderVariables(medSchema);
            updateRunButton();
        } catch (err) {
            medSchema = null;
            console.warn('Esquema mediación:', err.message);
        }
    }

    async function runMediation() {
        const id = getDatasetId();
        if (!id) {
            App().showToast('Cargue una base de datos primero', 'info');
            return;
        }
        const exposureId = document.getElementById('medExposure')?.value;
        if (!exposureId) {
            App().showToast('Seleccione una exposición materna', 'info');
            return;
        }
        const adjust = document.getElementById('medAdjustCovariates')?.checked !== false;

        App().showLoading('Calculando mediación (' + (medSchema?.n_boot || 5000) + ' bootstrap)...');
        try {
            const data = await apiPost('/datasets/' + encodeURIComponent(id) + '/avanzado/mediation/run', {
                exposure_id: exposureId,
                adjust_edad_sexo: adjust
            });
            renderResults(data);
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function bindControls() {
        document.getElementById('medRunBtn')?.addEventListener('click', runMediation);
        document.getElementById('medBackBtn')?.addEventListener('click', resetMediation);
        document.getElementById('medExposure')?.addEventListener('change', function () {
            updateHypothesisFromSelection();
            renderVariables(medSchema || { exposures: [] });
            updateRunButton();
        });
    }

    function init() {
        bindControls();
        resetMediation();
    }

    function onSubmoduleShown() {
        loadSchema();
    }

    function onDatasetChanged() {
        resetMediation();
        loadSchema();
    }

    window.AnalysisAvanzadoMediation = {
        init: init,
        loadSchema: loadSchema,
        onSubmoduleShown: onSubmoduleShown,
        onDatasetChanged: onDatasetChanged
    };
})();
