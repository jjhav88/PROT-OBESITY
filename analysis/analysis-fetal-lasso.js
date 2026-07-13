/**
 * Módulo 4.4 — Regresión logística LASSO (obesidad).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let lassoSchema = null;

    function getDatasetId() {
        const ds = App().state.activeDataset;
        return ds && ds.id ? ds.id : null;
    }

    async function parseResponse(res) {
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(data.detail || data.message || 'Error');
        return data;
    }

    function renderGuide(sections, mountId) {
        const mount = document.getElementById(mountId);
        if (!mount || !sections || !sections.length) return;
        let h = '<div class="analysis-fetal-lasso-guide">';
        sections.forEach(function (sec) {
            h += '<details class="analysis-fetal-guide-item"><summary>' + App().escapeHtml(sec.title) + '</summary><p>' + App().escapeHtml(sec.text) + '</p></details>';
        });
        h += '</div>';
        mount.innerHTML = h;
    }

    function getMultiselect() {
        return document.getElementById('fetalLassoPredictorSelect');
    }

    function getSelectedPresetId() {
        const r = document.querySelector('input[name="fetalLassoPreset"]:checked');
        return r ? r.value : (lassoSchema && lassoSchema.default_preset_id) || 'minimal';
    }

    function getSelectedPredictorIds() {
        const sel = getMultiselect();
        if (!sel) return [];
        return Array.from(sel.selectedOptions).map(function (o) {
            return o.value;
        });
    }

    function applyPresetToSelect(presetId) {
        const sel = getMultiselect();
        if (!sel || !lassoSchema) return;
        document.querySelectorAll('.analysis-fetal-preset-option').forEach(function (el) {
            el.classList.toggle('is-active', el.querySelector('input')?.value === presetId);
        });
        if (presetId === 'custom') return;
        const preset = (lassoSchema.predictor_presets || []).find(function (p) {
            return p.id === presetId;
        });
        if (!preset) return;
        let ids = preset.predictor_ids;
        if (presetId === 'all' || ids == null) {
            ids = (lassoSchema.choosable_predictors || [])
                .filter(function (c) {
                    return c.available;
                })
                .map(function (c) {
                    return c.id;
                });
        }
        const set = new Set(ids || []);
        Array.from(sel.options).forEach(function (opt) {
            opt.selected = set.has(opt.value);
        });
    }

    function renderVariableSelection(schema) {
        const mount = document.getElementById('fetalLassoVarMount');
        if (!mount || !schema) return;

        const choosable = (schema.choosable_predictors || []).filter(function (c) {
            return c.available;
        });
        const defaultId = schema.default_preset_id || 'minimal';

        let h = '<h4 class="analysis-fetal-lasso-vars-heading">Conjunto de predictores</h4>';
        h +=
            '<p class="analysis-fetal-note">Si el AUC con todas las variables es bajo, pruebe un núcleo más pequeño. ' +
            'Elija un perfil temático (se marcan solas en la lista) o personalice con Ctrl+clic.</p>';
        h += '<div class="analysis-fetal-lasso-presets" role="radiogroup" aria-label="Conjuntos de variables">';
        (schema.predictor_presets || []).forEach(function (p) {
            const checked = p.id === defaultId ? ' checked' : '';
            const nNote =
                p.n_complete != null
                    ? 'n completo=' + p.n_complete + (p.min_complete_required ? ' (mín. ' + p.min_complete_required + ')' : '')
                    : 'lista manual';
            h +=
                '<label class="analysis-fetal-preset-option' +
                (p.id === defaultId ? ' is-active' : '') +
                '">' +
                '<input type="radio" name="fetalLassoPreset" value="' +
                App().escapeHtml(p.id) +
                '"' +
                checked +
                ' />' +
                '<span><strong>' +
                App().escapeHtml(p.label) +
                '</strong>' +
                App().escapeHtml(p.description || '') +
                '<span class="analysis-fetal-preset-meta"> · ' +
                App().escapeHtml(nNote) +
                '</span></span></label>';
        });
        h += '</div>';

        h += '<label class="analysis-fetal-lasso-multiselect-label">Variables incluidas en el modelo';
        h +=
            '<select id="fetalLassoPredictorSelect" multiple class="analysis-desc-multiselect analysis-fetal-lasso-multiselect">';
        choosable.forEach(function (c) {
            h +=
                '<option value="' +
                App().escapeHtml(c.id) +
                '">' +
                App().escapeHtml(c.label) +
                '</option>';
        });
        h += '</select></label>';

        mount.innerHTML = h;

        applyPresetToSelect(defaultId);

        mount.querySelectorAll('input[name="fetalLassoPreset"]').forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (radio.checked) {
                    applyPresetToSelect(radio.value);
                }
            });
        });

        getMultiselect()?.addEventListener('change', function () {
            const custom = document.querySelector('input[name="fetalLassoPreset"][value="custom"]');
            if (custom) {
                custom.checked = true;
                applyPresetToSelect('custom');
            }
        });
    }

    function plotRoc(roc, chartId) {
        if (!window.Plotly || !roc || !roc.roc_cv) return;
        const pts = roc.roc_cv;
        Plotly.newPlot(
            chartId,
            [
                {
                    type: 'scatter',
                    mode: 'lines',
                    name: 'CV (' + (roc.auc_cv != null ? roc.auc_cv : '—') + ')',
                    x: pts.map(function (p) {
                        return p.fpr;
                    }),
                    y: pts.map(function (p) {
                        return p.tpr;
                    }),
                    line: { color: '#c2410c', width: 2 }
                },
                {
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Azar (AUC=0.5)',
                    x: [0, 1],
                    y: [0, 1],
                    line: { color: '#94a3b8', dash: 'dash', width: 1 }
                }
            ],
            {
                title: 'Curva ROC (validación cruzada)',
                xaxis: { title: '1 − Especificidad', range: [0, 1] },
                yaxis: { title: 'Sensibilidad', range: [0, 1] },
                margin: { t: 44, b: 48, l: 56, r: 16 },
                height: 320,
                showlegend: true
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function forestColor(role) {
        if (role === 'riesgo') return '#dc2626';
        if (role === 'protector') return '#2563eb';
        return '#64748b';
    }

    function plotForestPlot(items, chartId) {
        if (!window.Plotly || !items || !items.length) return;
        const sorted = items.slice().sort(function (a, b) {
            return (b.odds_ratio || 1) - (a.odds_ratio || 1);
        });
        const labels = sorted.map(function (x) {
            return x.label;
        });
        const ors = sorted.map(function (x) {
            return x.odds_ratio;
        });
        const colors = sorted.map(function (x) {
            return forestColor(x.role);
        });
        const hover = sorted.map(function (x) {
            const ci =
                x.ci_lo != null && x.ci_hi != null
                    ? 'IC 95%: [' + x.ci_lo + ', ' + x.ci_hi + ']'
                    : 'IC 95%: —';
            return x.label + '<br>OR=' + x.odds_ratio + '<br>' + ci;
        });
        const hasCi = sorted.some(function (x) {
            return x.ci_lo != null && x.ci_hi != null;
        });

        const traces = [
            {
                type: 'scatter',
                mode: 'markers',
                x: ors,
                y: labels,
                marker: {
                    symbol: 'square',
                    size: 11,
                    color: colors,
                    line: { width: 1, color: '#fff' }
                },
                error_x: hasCi
                    ? {
                          type: 'data',
                          symmetric: false,
                          color: colors,
                          thickness: 2,
                          width: 0,
                          array: sorted.map(function (x) {
                              return x.ci_hi != null && x.odds_ratio != null ? Math.max(0, x.ci_hi - x.odds_ratio) : 0;
                          }),
                          arrayminus: sorted.map(function (x) {
                              return x.ci_lo != null && x.odds_ratio != null ? Math.max(0, x.odds_ratio - x.ci_lo) : 0;
                          })
                      }
                    : undefined,
                text: hover,
                hoverinfo: 'text',
                showlegend: false
            }
        ];

        const xvals = sorted.flatMap(function (x) {
            const v = [x.odds_ratio];
            if (x.ci_lo != null) v.push(x.ci_lo);
            if (x.ci_hi != null) v.push(x.ci_hi);
            return v;
        }).filter(function (v) {
            return v != null && v > 0;
        });
        const xmin = Math.min.apply(null, xvals.concat([0.15]));
        const xmax = Math.max.apply(null, xvals.concat([2]));

        Plotly.newPlot(
            chartId,
            traces,
            {
                title: 'Forest plot — odds ratios e IC 95%',
                xaxis: {
                    title: 'Odds ratio (escala log)',
                    type: 'log',
                    range: [Math.log10(xmin * 0.85), Math.log10(xmax * 1.15)],
                    zeroline: false
                },
                yaxis: {
                    automargin: true,
                    categoryorder: 'array',
                    categoryarray: labels
                },
                shapes: [
                    {
                        type: 'line',
                        x0: 1,
                        x1: 1,
                        y0: 0,
                        y1: 1,
                        xref: 'x',
                        yref: 'paper',
                        line: { color: '#334155', width: 1.5, dash: 'dash' }
                    }
                ],
                annotations: [
                    {
                        x: 1,
                        y: 1.02,
                        xref: 'paper',
                        yref: 'paper',
                        text: 'OR = 1 (sin efecto)',
                        showarrow: false,
                        font: { size: 11, color: '#64748b' }
                    }
                ],
                margin: { t: 48, b: 52, l: 240, r: 32 },
                height: Math.max(280, sorted.length * 44 + 80)
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderResultsInterpretation(interp) {
        if (!interp) return '';
        let h = '<section class="analysis-fetal-results-block analysis-fetal-lasso-interpret">';
        h += '<h4 class="analysis-fetal-results-heading">' + App().escapeHtml(interp.title || 'Interpretación') + '</h4>';
        if (interp.what_is_lasso) {
            h +=
                '<div class="analysis-fetal-lasso-what"><p><strong>¿Qué hace el LASSO en esta sección?</strong> ' +
                App().escapeHtml(interp.what_is_lasso) +
                '</p></div>';
        }
        if (interp.summary_bullets && interp.summary_bullets.length) {
            h += '<ul class="analysis-fetal-lasso-interpret-bullets">';
            interp.summary_bullets.forEach(function (b) {
                h += '<li>' + App().escapeHtml(b) + '</li>';
            });
            h += '</ul>';
        }
        (interp.paragraphs || []).forEach(function (p) {
            h += '<p class="analysis-fetal-interpret-para">' + App().escapeHtml(p) + '</p>';
        });
        h += '</section>';
        return h;
    }

    function roleBadge(role, label) {
        const cls =
            role === 'riesgo' ? 'risk' : role === 'protector' ? 'protect' : role === 'inconcluso' ? 'neutral' : 'muted';
        return '<span class="analysis-fetal-role-badge ' + cls + '">' + App().escapeHtml(label || role || '—') + '</span>';
    }

    function renderResults(data) {
        const mount = document.getElementById('fetalLassoResultsMount');
        if (!mount) return;

        const out = data.outcome || {};
        const meth = data.method || {};
        const disc = data.discrimination || {};

        const vs = data.variable_selection || {};

        let h = '<section class="analysis-fetal-results-block">';
        h += '<h4 class="analysis-fetal-results-heading">Resumen del modelo</h4>';
        if (vs.preset_label) {
            h +=
                '<p class="analysis-infer-stat-line"><strong>Conjunto de variables:</strong> ' +
                App().escapeHtml(vs.preset_label) +
                ' (' +
                (vs.n_features_in_model != null ? vs.n_features_in_model : '—') +
                ' columnas en el modelo; n≥' +
                (vs.min_complete_required != null ? vs.min_complete_required : '—') +
                ' casos completos)</p>';
        }
        h +=
            '<p class="analysis-infer-stat-line"><strong>¿Qué se predice?</strong> ' +
            App().escapeHtml(out.label || 'Obesidad (1) vs normopeso (0)') +
            '. No se incluyen niños con sobrepeso ni bajo peso.</p>';
        h +=
            '<p class="analysis-infer-stat-line"><strong>Muestra analizada:</strong> n=' +
            (out.n_model || '—') +
            ' (Obesidad=' +
            (out.n_obesidad_model || '—') +
            ', Normopeso=' +
            (out.n_normopeso_model || '—') +
            ').</p>';
        h +=
            '<p class="analysis-infer-stat-line"><strong>Capacidad discriminativa (AUC por validación cruzada):</strong> ' +
            (disc.auc_cv != null ? disc.auc_cv : '—') +
            (disc.interpretation && disc.interpretation.level ? ' — ' + App().escapeHtml(disc.interpretation.level) : '') +
            '</p>';
        if (disc.interpretation && disc.interpretation.text) {
            h += '<p class="analysis-fetal-note">' + App().escapeHtml(disc.interpretation.text) + '</p>';
        }
        if (disc.auc_in_sample != null) {
            h +=
                '<p class="analysis-fetal-note"><em>AUC en toda la muestra (más optimista):</em> ' +
                disc.auc_in_sample +
                '. ' +
                App().escapeHtml(disc.note || '') +
                '</p>';
        }
        h +=
            '<p class="analysis-infer-stat-line"><strong>Predictores seleccionados por LASSO:</strong> ' +
            (data.n_selected != null ? data.n_selected : '—') +
            ' de ' +
            (data.n_features != null ? data.n_features : '—') +
            ' · ' +
            (data.n_risk_factors || 0) +
            ' riesgo · ' +
            (data.n_protective_factors || 0) +
            ' protector · ' +
            (data.n_inconclusive_factors || 0) +
            ' no concluyente</p>';
        h += '</section>';

        h += '<div id="fetalLassoRocChart" class="analysis-fetal-chart"></div>';

        h += '<section class="analysis-fetal-results-block">';
        h += '<h4 class="analysis-fetal-results-heading">Tabla de odds ratios (OR)</h4>';
        h += '<p class="analysis-fetal-note">OR = 1: sin cambio. OR &gt; 1: más probabilidad de obesidad. OR &lt; 1: menos probabilidad. El IC 95% estimado por bootstrap indica la precisión del OR en esta muestra.</p>';
        h += '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>Predictor</th><th>OR</th><th>IC 95%</th><th>Tipo</th><th>Qué significa</th></tr></thead><tbody>';
        (data.selected_predictors || []).forEach(function (r) {
            const ci = r.ci_or && r.ci_or.display ? r.ci_or.display : '—';
            h +=
                '<tr><td>' +
                App().escapeHtml(r.label) +
                '</td><td>' +
                (r.odds_ratio != null ? r.odds_ratio : '—') +
                '</td><td>' +
                App().escapeHtml(ci) +
                '</td><td>' +
                roleBadge(r.role, r.role_label) +
                '</td><td>' +
                App().escapeHtml(r.summary || r.direction || '') +
                '</td></tr>';
        });
        if (!(data.selected_predictors || []).length) {
            h += '<tr><td colspan="5">Ningún predictor con coeficiente distinto de cero.</td></tr>';
        }
        h += '</tbody></table></div>';
        h += '</section>';

        if ((data.forest_plot || data.or_chart || []).length) {
            h += '<section class="analysis-fetal-results-block">';
            h += '<h4 class="analysis-fetal-results-heading">Forest plot</h4>';
            h +=
                '<p class="analysis-fetal-note">Cada cuadrado es el OR del predictor; la línea horizontal es el IC 95%. ' +
                'La línea punteada vertical en OR=1 indica «sin efecto». Rojo: posible riesgo; azul: posible protector; gris: no concluyente.</p>';
            h += '<div id="fetalLassoForestPlot" class="analysis-fetal-chart analysis-fetal-forest"></div>';
            h += '</section>';
        }

        h += '<div class="analysis-fetal-insight"><h4>' + App().escapeHtml(data.insight.title) + '</h4>';
        (data.insight.paragraphs || []).forEach(function (p) {
            h += '<p>' + App().escapeHtml(p) + '</p>';
        });
        h += '</div>';

        h += renderResultsInterpretation(data.results_interpretation);

        mount.innerHTML = h;
        plotRoc(disc, 'fetalLassoRocChart');
        const forestData = data.forest_plot || data.or_chart;
        if (forestData && forestData.length) plotForestPlot(forestData, 'fetalLassoForestPlot');
        document.getElementById('fetalLassoStepResults').hidden = false;
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) return;
        lassoSchema = await parseResponse(
            await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/lasso/schema')
        );
        const s = lassoSchema;
        const intro = document.getElementById('fetalLassoIntro');
        if (intro) {
            intro.textContent =
                (s.description || '') +
                ' Casos completos (todas las variables): n=' +
                s.n_complete +
                ' (Obesidad=' +
                s.n_obesidad_complete +
                ', Normopeso=' +
                s.n_normopeso_complete +
                ').';
        }
        renderGuide(s.interpretation_guide, 'fetalLassoGuideMount');
        renderVariableSelection(s);
        const btn = document.getElementById('fetalLassoRunBtn');
        if (btn) {
            btn.disabled = !s.ready;
            if (!s.sklearn_available) {
                btn.title = 'Instale scikit-learn en el servidor (pip install scikit-learn)';
            }
        }
    }

    async function run() {
        const id = getDatasetId();
        if (!id) return;
        const presetId = getSelectedPresetId();
        const predictorIds = getSelectedPredictorIds();
        if (!predictorIds.length) {
            App().showToast('Seleccione al menos un predictor.', 'error');
            return;
        }
        App().showLoading('Ejecutando LASSO (AUC, OR e IC 95%)...');
        try {
            const data = await parseResponse(
                await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/lasso/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        preset_id: presetId,
                        predictor_ids: predictorIds
                    })
                })
            );
            renderResults(data);
        } catch (e) {
            App().showToast(e.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function init() {
        document.getElementById('fetalLassoRunBtn')?.addEventListener('click', run);
        document.getElementById('fetalLassoBackBtn')?.addEventListener('click', function () {
            document.getElementById('fetalLassoStepResults').hidden = true;
        });
    }

    window.AnalysisFetalLasso = {
        init: init,
        onShown: loadSchema,
        onDatasetChanged: function () {
            document.getElementById('fetalLassoStepResults').hidden = true;
            loadSchema();
        }
    };
})();
