/**
 * Módulo 4.5 — Árbol de decisión CART.
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

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
        mount.innerHTML =
            '<div class="analysis-fetal-lasso-guide">' +
            sections
                .map(function (sec) {
                    return (
                        '<details class="analysis-fetal-guide-item"><summary>' +
                        App().escapeHtml(sec.title) +
                        '</summary><p>' +
                        App().escapeHtml(sec.text) +
                        '</p></details>'
                    );
                })
                .join('') +
            '</div>';
    }

    function renderOutcomeSelect(modes) {
        const sel = document.getElementById('fetalTreeOutcomeMode');
        if (!sel) return;
        sel.innerHTML = (modes || [])
            .map(function (m) {
                const ready = m.ready ? '' : ' (datos insuficientes)';
                return (
                    '<option value="' +
                    App().escapeHtml(m.id) +
                    '"' +
                    (m.ready ? '' : ' disabled') +
                    '>' +
                    App().escapeHtml(m.label) +
                    ready +
                    '</option>'
                );
            })
            .join('');
        const firstReady = (modes || []).find(function (m) {
            return m.ready;
        });
        if (firstReady) sel.value = firstReady.id;
    }

    function probSummary(probs) {
        if (!probs) return '';
        return Object.keys(probs)
            .map(function (k) {
                return k + ' ' + Math.round((probs[k] || 0) * 100) + '%';
            })
            .join(' · ');
    }

    function renderTreeNode(node) {
        if (!node || !node.type) return '';
        if (node.type === 'leaf') {
            const pred = node.predicted_class || '—';
            const color = node.color || '#64748b';
            return (
                '<li class="analysis-fetal-dtree-leaf">' +
                '<div class="analysis-fetal-dtree-box leaf" style="border-color:' +
                color +
                '">' +
                '<strong>' +
                App().escapeHtml(pred) +
                '</strong>' +
                '<span class="analysis-fetal-dtree-meta">n=' +
                (node.n_samples || '—') +
                '</span>' +
                '<span class="analysis-fetal-dtree-probs">' +
                App().escapeHtml(probSummary(node.class_probs)) +
                '</span>' +
                '</div></li>'
            );
        }
        const left = node.left || {};
        const right = node.right || {};
        return (
            '<li class="analysis-fetal-dtree-split">' +
            '<div class="analysis-fetal-dtree-box split">' +
            '<span class="analysis-fetal-dtree-q">' +
            App().escapeHtml(node.question || node.feature_label || '¿?') +
            '</span>' +
            '<span class="analysis-fetal-dtree-meta">n=' +
            (node.n_samples || '—') +
            '</span>' +
            '</div>' +
            '<ul class="analysis-fetal-dtree-branches">' +
            '<li class="analysis-fetal-dtree-branch"><span class="analysis-fetal-dtree-edge">' +
            App().escapeHtml(left.branch_label || 'No') +
            '</span><ul>' +
            renderTreeNode(left.child) +
            '</ul></li>' +
            '<li class="analysis-fetal-dtree-branch"><span class="analysis-fetal-dtree-edge">' +
            App().escapeHtml(right.branch_label || 'Sí') +
            '</span><ul>' +
            renderTreeNode(right.child) +
            '</ul></li>' +
            '</ul></li>'
        );
    }

    function renderTreeDiagram(tree) {
        if (!tree) return '';
        return (
            '<div class="analysis-fetal-dtree-wrap"><ul class="analysis-fetal-dtree">' + renderTreeNode(tree) + '</ul></div>'
        );
    }

    function plotImportance(items, chartId) {
        if (!window.Plotly || !items || !items.length) return;
        const sorted = items.slice().sort(function (a, b) {
            return (b.importance || 0) - (a.importance || 0);
        });
        Plotly.newPlot(
            chartId,
            [
                {
                    type: 'bar',
                    orientation: 'h',
                    y: sorted.map(function (x) {
                        return x.label;
                    }),
                    x: sorted.map(function (x) {
                        return x.importance;
                    }),
                    marker: { color: '#ea580c' }
                }
            ],
            {
                title: 'Importancia de variables en el árbol',
                xaxis: { title: 'Importancia', range: [0, Math.max(0.05, (sorted[0] && sorted[0].importance) || 0.1)] },
                margin: { t: 44, b: 48, l: 200, r: 16 },
                height: Math.max(220, sorted.length * 32)
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderResults(data) {
        const mount = document.getElementById('fetalTreeResultsMount');
        if (!mount) return;

        const met = data.metrics || {};
        const out = data.outcome || {};
        let h = '<section class="analysis-fetal-results-block">';
        h += '<h4 class="analysis-fetal-results-heading">Resumen del árbol CART</h4>';
        h +=
            '<p class="analysis-infer-stat-line"><strong>Objetivo:</strong> ' +
            App().escapeHtml(out.label || '') +
            ' · <strong>n=</strong>' +
            (data.n_model || '—') +
            '</p>';
        if (out.counts) {
            h +=
                '<p class="analysis-infer-stat-line"><strong>Distribución:</strong> ' +
                Object.keys(out.counts)
                    .map(function (k) {
                        return k + '=' + out.counts[k];
                    })
                    .join(', ') +
                '</p>';
        }
        h +=
            '<p class="analysis-infer-stat-line"><strong>Precisión balanceada (validación cruzada):</strong> ' +
            (met.balanced_accuracy_cv != null ? met.balanced_accuracy_cv : '—') +
            ' · <strong>Hojas:</strong> ' +
            (met.n_leaves || '—') +
            ' · <strong>Profundidad:</strong> ' +
            (met.depth || '—') +
            '</p>';
        h +=
            '<p class="analysis-fetal-note">ccp (poda) seleccionado: ' +
            (data.method && data.method.ccp_alpha_selected != null ? data.method.ccp_alpha_selected : '—') +
            '. En muestras pequeñas prefiera la lectura de reglas con más niños (n) en cada hoja.</p>';
        h += '</section>';

        h += '<section class="analysis-fetal-results-block">';
        h += '<h4 class="analysis-fetal-results-heading">Diagrama del árbol</h4>';
        h +=
            '<p class="analysis-fetal-note">Siga las ramas de arriba hacia abajo. Las hojas indican la categoría más probable y el porcentaje en esa rama.</p>';
        h += renderTreeDiagram(data.tree);
        h += '</section>';

        if ((data.rules || []).length) {
            h += '<section class="analysis-fetal-results-block">';
            h += '<h4 class="analysis-fetal-results-heading">Reglas clínicas (rutas a hojas)</h4>';
            h += '<div class="analysis-fetal-rules-list">';
            data.rules.forEach(function (r, i) {
                const cls = r.clinical_highlight ? ' highlight' : '';
                h +=
                    '<div class="analysis-fetal-rule-card' +
                    cls +
                    '"><span class="analysis-fetal-rule-num">' +
                    (i + 1) +
                    '</span><p>' +
                    App().escapeHtml(r.rule_text || '') +
                    '</p><p class="analysis-fetal-dtree-probs">' +
                    App().escapeHtml(probSummary(r.class_probs)) +
                    '</p></div>';
            });
            h += '</div></section>';
        }

        if (data.rules_text) {
            h += '<section class="analysis-fetal-results-block">';
            h += '<h4 class="analysis-fetal-results-heading">Árbol en texto (exportación)</h4>';
            h += '<pre class="analysis-fetal-tree-text">' + App().escapeHtml(data.rules_text) + '</pre>';
            h += '</section>';
        }

        if ((data.feature_importance || []).length) {
            h += '<section class="analysis-fetal-results-block">';
            h += '<h4 class="analysis-fetal-results-heading">Variables más usadas para dividir</h4>';
            h += '<div id="fetalTreeImportanceChart" class="analysis-fetal-chart"></div>';
            h += '</section>';
        }

        if ((data.confusion_matrix || []).length) {
            h += '<section class="analysis-fetal-results-block">';
            h += '<h4 class="analysis-fetal-results-heading">Matriz de confusión (muestra completa)</h4>';
            h += '<p class="analysis-fetal-note">Exploratoria: filas = categoría real, columnas = predicha por el árbol en los mismos datos.</p>';
            const preds = Object.keys(data.confusion_matrix[0].predicted_counts || {});
            h += '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>Real \\ Pred</th>';
            preds.forEach(function (p) {
                h += '<th>' + App().escapeHtml(p) + '</th>';
            });
            h += '</tr></thead><tbody>';
            data.confusion_matrix.forEach(function (row) {
                h += '<tr><td>' + App().escapeHtml(row.actual) + '</td>';
                preds.forEach(function (p) {
                    h += '<td>' + (row.predicted_counts[p] || 0) + '</td>';
                });
                h += '</tr>';
            });
            h += '</tbody></table></div></section>';
        }

        h += '<div class="analysis-fetal-insight"><h4>' + App().escapeHtml(data.insight.title) + '</h4>';
        (data.insight.paragraphs || []).forEach(function (p) {
            h += '<p>' + App().escapeHtml(p) + '</p>';
        });
        h += '</div>';

        if (data.interpretation_guide && data.interpretation_guide.length) {
            h += '<section class="analysis-fetal-results-block"><h4 class="analysis-fetal-results-heading">Guía de lectura</h4>';
            data.interpretation_guide.forEach(function (sec) {
                h +=
                    '<details class="analysis-fetal-guide-item"><summary>' +
                    App().escapeHtml(sec.title) +
                    '</summary><p>' +
                    App().escapeHtml(sec.text) +
                    '</p></details>';
            });
            h += '</section>';
        }

        mount.innerHTML = h;
        if ((data.feature_importance || []).length) plotImportance(data.feature_importance, 'fetalTreeImportanceChart');
        document.getElementById('fetalTreeStepResults').hidden = false;
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) return;
        const s = await parseResponse(await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/tree/schema'));
        const intro = document.getElementById('fetalTreeIntro');
        if (intro) intro.textContent = s.description || '';
        renderGuide(s.interpretation_guide, 'fetalTreeGuideMount');
        renderOutcomeSelect(s.outcome_modes);
        const btn = document.getElementById('fetalTreeRunBtn');
        if (btn) {
            btn.disabled = !s.ready;
            if (!s.sklearn_available) btn.title = 'Instale scikit-learn en el servidor';
        }
    }

    async function run() {
        const id = getDatasetId();
        if (!id) return;
        const mode = document.getElementById('fetalTreeOutcomeMode')?.value || 'ternary';
        App().showLoading('Construyendo árbol CART...');
        try {
            const data = await parseResponse(
                await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/tree/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ outcome_mode: mode })
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
        document.getElementById('fetalTreeRunBtn')?.addEventListener('click', run);
        document.getElementById('fetalTreeBackBtn')?.addEventListener('click', function () {
            document.getElementById('fetalTreeStepResults').hidden = true;
        });
    }

    window.AnalysisFetalTree = {
        init: init,
        onShown: loadSchema,
        onDatasetChanged: function () {
            document.getElementById('fetalTreeStepResults').hidden = true;
            loadSchema();
        }
    };
})();
