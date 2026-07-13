/**
 * Programación fetal — correlacionar IAP (matriz Spearman + pares).
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

    function corrMethodLabel(method) {
        return method === 'pearson' ? 'Pearson' : 'Spearman';
    }

    function heatmapMargins(labels) {
        const lens = (labels || []).map(function (l) {
            return String(l).length;
        });
        const maxLen = lens.length ? Math.max.apply(null, lens) : 10;
        return {
            t: 100,
            b: Math.min(220, 64 + maxLen * 5),
            l: Math.min(200, 88 + maxLen * 5),
            r: 72
        };
    }

    function plotCorrelationMatrix(containerId, matrix) {
        if (!window.Plotly || !matrix || matrix.error) return;
        const labels = matrix.labels || [];
        const text = (matrix.matrix || []).map(function (row, i) {
            return row.map(function (v, j) {
                if (i === j) return v != null ? String(v) : '—';
                const p = matrix.p_matrix[i][j];
                const star = matrix.significant[i][j] ? '*' : '';
                return v != null ? String(v) + star + (p != null ? '\np=' + p : '') : '—';
            });
        });
        const titleFn = window.AnalysisPlotly && window.AnalysisPlotly.plotTitle;
        const title =
            'Matriz de correlación — ' +
            corrMethodLabel(matrix.method) +
            ' (n=' +
            matrix.n +
            ' casos completos)';

        Plotly.newPlot(
            containerId,
            [
                {
                    z: matrix.matrix,
                    x: labels,
                    y: labels,
                    text: text,
                    texttemplate: '%{text}',
                    hovertemplate: '%{y} × %{x}<br>ρ=%{z}<extra></extra>',
                    type: 'heatmap',
                    colorscale: 'RdBu',
                    zmid: 0,
                    zmin: -1,
                    zmax: 1,
                    colorbar: { title: 'ρ' }
                }
            ],
            {
                title: titleFn ? titleFn(title) : title,
                margin: heatmapMargins(labels),
                xaxis: {
                    tickangle: labels.length > 3 ? -32 : -22,
                    automargin: true,
                    side: 'bottom'
                },
                yaxis: { automargin: true },
                height: Math.max(320, 72 * labels.length)
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderMatrixMethodNote(matrix) {
        if (!matrix || matrix.error) {
            return (
                '<p class="analysis-preview-note">' +
                App().escapeHtml(matrix?.error || 'No se pudo calcular la matriz.') +
                '</p>'
            );
        }
        return (
            '<p class="analysis-corr-method-note"><strong>Método: ' +
            App().escapeHtml(matrix.method_label || corrMethodLabel(matrix.method)) +
            '</strong> — ' +
            App().escapeHtml(matrix.method_reason || '') +
            ' · n=' +
            matrix.n +
            ' · * p &lt; ' +
            (matrix.alpha != null ? matrix.alpha : 0.05) +
            '</p>'
        );
    }

    function renderPairTable(correlations) {
        let rows = '';
        (correlations || []).forEach(function (r) {
            rows +=
                '<tr><td>' +
                App().escapeHtml(r.label) +
                '</td><td>' +
                (r.rho == null ? '—' : r.rho) +
                '</td><td>' +
                (r.p_value == null ? '—' : r.p_value) +
                (r.significant ? ' *' : '') +
                '</td><td>' +
                (r.n || '—') +
                '</td><td>' +
                App().escapeHtml(r.direction || '—') +
                '</td></tr>';
        });
        return (
            '<p class="analysis-infer-table-title">Detalle IAP vs cada variable (pares con datos completos)</p>' +
            '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr>' +
            '<th>Variable</th><th>ρ</th><th>p</th><th>n</th><th>Dirección</th>' +
            '</tr></thead><tbody>' +
            rows +
            '</tbody></table></div>'
        );
    }

    function plotScatter(sp, chartId) {
        if (!window.Plotly || !sp || !sp.points) return;
        const pts = sp.points;
        const titleFn = window.AnalysisPlotly && window.AnalysisPlotly.plotTitle;
        const title = sp.label + ' vs IAP (ρ=' + (sp.rho != null ? sp.rho : '—') + ')';
        Plotly.newPlot(
            chartId,
            [
                {
                    type: 'scatter',
                    mode: 'markers',
                    x: pts.map(function (p) {
                        return p.iap;
                    }),
                    y: pts.map(function (p) {
                        return p.y;
                    }),
                    marker: { color: '#7c2d12', size: 8, opacity: 0.65 }
                }
            ],
            {
                title: titleFn ? titleFn(title) : title,
                xaxis: { title: 'IAP', dtick: 1 },
                yaxis: { title: sp.label },
                margin: { t: 100, b: 48, l: 56, r: 16 },
                height: 300
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderResults(data) {
        const mount = document.getElementById('fetalCorrelateResultsMount');
        if (!mount) return;

        const matrix = data.correlation_matrix || {};
        const heatId = 'fetalCorrMatrix-' + Date.now();
        let h = '';

        h += '<h4 class="analysis-corr-matrix-title">Matriz de correlación IAP – perfil lipídico</h4>';
        h += renderMatrixMethodNote(matrix);
        if (!matrix.error) {
            h +=
                '<div id="' +
                heatId +
                '" class="analysis-chart analysis-chart-wide analysis-chart-heatmap analysis-fetal-corr-matrix"></div>';
        }

        h += renderPairTable(data.correlations);

        if ((data.scatter_plots || []).length) {
            h += '<p class="analysis-fetal-chart-caption"><strong>Dispersión exploratoria</strong> (submuestra de puntos)</p>';
            (data.scatter_plots || []).forEach(function (sp, i) {
                h += '<div id="fetalCorr-' + i + '" class="analysis-fetal-chart"></div>';
            });
        }

        h += '<div class="analysis-fetal-insight"><h4>' + App().escapeHtml(data.insight.title) + '</h4>';
        (data.insight.paragraphs || []).forEach(function (p) {
            h += '<p>' + App().escapeHtml(p) + '</p>';
        });
        h += '</div>';

        mount.innerHTML = h;

        if (!matrix.error) {
            plotCorrelationMatrix(heatId, matrix);
        }
        (data.scatter_plots || []).forEach(function (sp, i) {
            plotScatter(sp, 'fetalCorr-' + i);
        });
        document.getElementById('fetalCorrelateStepResults').hidden = false;
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) return;
        const s = await parseResponse(
            await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/correlate/schema')
        );
        const intro = document.getElementById('fetalCorrelateIntro');
        if (intro) {
            intro.textContent = s.description || '';
            if (s.matrix_variables && s.matrix_variables.length) {
                intro.textContent +=
                    ' Variables en la matriz: ' + s.matrix_variables.join(', ') + '.';
            }
        }
        document.getElementById('fetalCorrelateRunBtn').disabled = !s.ready;
    }

    async function run() {
        const id = getDatasetId();
        if (!id) return;
        App().showLoading('Calculando matriz de correlación...');
        try {
            const data = await parseResponse(
                await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/correlate/run', {
                    method: 'POST'
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
        document.getElementById('fetalCorrelateRunBtn')?.addEventListener('click', run);
        document.getElementById('fetalCorrelateBackBtn')?.addEventListener('click', function () {
            document.getElementById('fetalCorrelateStepResults').hidden = true;
        });
    }

    window.AnalysisFetalCorrelate = {
        init: init,
        onShown: loadSchema,
        onDatasetChanged: function () {
            document.getElementById('fetalCorrelateStepResults').hidden = true;
            loadSchema();
        }
    };
})();
