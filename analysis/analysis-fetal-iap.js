/**
 * Programación fetal — construcción del IAP (índice de adversidad perinatal).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;
    let schema = null;

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

    function renderIndexDefinition(def, preview) {
        const mount = document.getElementById('fetalIapIntro');
        if (!mount || !def) return;
        let h = '<h4 class="analysis-fetal-iap-def-title">' + App().escapeHtml(def.name || 'IAP') + '</h4>';
        if (def.short_label) {
            h += '<p class="analysis-fetal-iap-def-short"><strong>' + App().escapeHtml(def.short_label) + '</strong></p>';
        }
        if (def.formula) {
            h += '<p><strong>Cálculo:</strong> ' + App().escapeHtml(def.formula) + '</p>';
        }
        if (def.literature_note) {
            h += '<p><strong>Marco conceptual:</strong> ' + App().escapeHtml(def.literature_note) + '</p>';
        }
        if (def.interpretation) {
            h += '<p><strong>Interpretación:</strong> ' + App().escapeHtml(def.interpretation) + '</p>';
        }
        if (preview) {
            h +=
                '<p class="analysis-fetal-iap-def-preview"><em>' + App().escapeHtml(preview) + '</em></p>';
        }
        mount.innerHTML = h;
    }

    function renderComponents(components) {
        const mount = document.getElementById('fetalIapComponentsMount');
        if (!mount) return;
        mount.innerHTML =
            '<p class="analysis-fetal-comp-heading"><strong>Los seis componentes del IAP</strong> (cada uno suma 1 punto si está presente):</p>' +
            '<div class="analysis-fetal-components">' +
            (components || [])
                .map(function (c) {
                    const cls = c.available ? '' : ' unavailable';
                    const pct = c.available
                        ? c.pct_positive + '% con punto (n=' + c.n_positive + ')'
                        : 'No disponible en la base';
                    return (
                        '<div class="analysis-fetal-comp-row' +
                        cls +
                        '"><span>' +
                        App().escapeHtml(c.label) +
                        '</span><span>' +
                        App().escapeHtml(pct) +
                        '</span></div>'
                    );
                })
                .join('') +
            '</div>';
    }

    function renderComponentTable(rows) {
        if (!rows || !rows.length) return '';
        let h =
            '<p class="analysis-infer-table-title">Puntos por componente (qué antecedentes suman al IAP)</p>';
        h += '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr>';
        h += '<th>Componente</th><th>Disponible</th><th>n con dato</th><th>n con 1 punto</th><th>% con punto</th>';
        h += '</tr></thead><tbody>';
        rows.forEach(function (c) {
            h += '<tr>';
            h += '<td>' + App().escapeHtml(c.label) + '</td>';
            h += '<td>' + (c.available ? 'Sí' : 'No') + '</td>';
            h += '<td>' + (c.n_scored != null ? c.n_scored : '—') + '</td>';
            h += '<td>' + (c.n_positive != null ? c.n_positive : '—') + '</td>';
            h +=
                '<td>' +
                (c.pct_positive != null ? App().escapeHtml(String(c.pct_positive)) + '%' : '—') +
                '</td>';
            h += '</tr>';
        });
        h += '</tbody></table></div>';
        return h;
    }

    function renderDistributionTable(bars) {
        if (!bars || !bars.length) return '';
        let h =
            '<p class="analysis-infer-table-title">Frecuencia de niños por puntuación IAP (el índice de cada niño)</p>';
        h += '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr>';
        h += '<th>Puntuación IAP</th><th>Número de niños (n)</th></tr></thead><tbody>';
        bars.forEach(function (b) {
            h += '<tr><td>' + b.iap + '</td><td>' + b.n + '</td></tr>';
        });
        h += '</tbody></table></div>';
        return h;
    }

    function plotDistribution(bars, chartId) {
        if (!window.Plotly || !bars || !bars.length) return;
        const titleFn = window.AnalysisPlotly && window.AnalysisPlotly.plotTitle;
        Plotly.newPlot(
            chartId,
            [
                {
                    type: 'bar',
                    x: bars.map(function (b) {
                        return 'IAP ' + b.iap;
                    }),
                    y: bars.map(function (b) {
                        return b.n;
                    }),
                    marker: { color: '#ea580c' },
                    name: 'Niños'
                }
            ],
            {
                title: titleFn
                    ? titleFn('Cuántos niños tienen cada puntuación IAP (0–6)')
                    : 'Cuántos niños tienen cada puntuación IAP (0–6)',
                yaxis: { title: 'Número de niños' },
                margin: { t: 100, b: 56, l: 56, r: 16 },
                showlegend: false,
                height: 340
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderResults(data) {
        const mount = document.getElementById('fetalIapResultsMount');
        if (!mount) return;
        const chartId = 'fetalIapChart-' + Date.now();
        const def = data.index_definition || schema?.index_definition || {};

        let h = '<div class="analysis-fetal-iap-result-def">';
        h += '<p class="analysis-fetal-iap-result-lead"><strong>El índice calculado es el IAP:</strong> ';
        h += App().escapeHtml(
            data.index_summary ||
                'puntuación entera de 0 a 6 que cuenta cuántos componentes de adversidad perinatal están presentes.'
        );
        h += '</p>';
        if (def.short_label) {
            h +=
                '<p class="analysis-infer-stat-line">' +
                App().escapeHtml(def.short_label) +
                '</p>';
        }
        h += '</div>';

        h +=
            '<p class="analysis-infer-stat-line"><strong>Cohorte analizada:</strong> n=' +
            data.n_scored +
            ' niños con IAP · <strong>Media=</strong>' +
            (data.mean_iap != null ? data.mean_iap : '—') +
            ' · <strong>Mediana=</strong>' +
            (data.median_iap != null ? data.median_iap : '—') +
            ' (escala 0–' +
            (data.max_points != null ? data.max_points : 6) +
            ')</p>';

        h += renderComponentTable(data.component_table || data.components);

        h += renderDistributionTable(data.bar_chart);

        h +=
            '<p class="analysis-infer-stat-line analysis-fetal-chart-caption">' +
            '<strong>Gráfico:</strong> mismo contenido que la tabla anterior: cuántos niños tienen IAP=0, 1, 2, … (no es la media de un componente).' +
            '</p>';
        h += '<div id="' + chartId + '" class="analysis-fetal-chart"></div>';

        h += '<div class="analysis-fetal-insight"><h4>' + App().escapeHtml(data.insight.title) + '</h4>';
        (data.insight.paragraphs || []).forEach(function (p) {
            h += '<p>' + App().escapeHtml(p) + '</p>';
        });
        h += '</div>';

        mount.innerHTML = h;
        plotDistribution(data.bar_chart, chartId);
        document.getElementById('fetalIapStepResults').hidden = false;
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) return;
        schema = await parseResponse(await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/iap/schema'));
        renderIndexDefinition(schema.index_definition || {}, schema.insight_preview);
        renderComponents(schema.components);
        const btn = document.getElementById('fetalIapRunBtn');
        if (btn) btn.disabled = !schema.ready;
    }

    async function run() {
        const id = getDatasetId();
        if (!id) return;
        App().showLoading('Calculando IAP...');
        try {
            const data = await parseResponse(
                await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/iap/run', { method: 'POST' })
            );
            renderResults(data);
        } catch (e) {
            App().showToast(e.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function init() {
        document.getElementById('fetalIapRunBtn')?.addEventListener('click', run);
        document.getElementById('fetalIapBackBtn')?.addEventListener('click', function () {
            document.getElementById('fetalIapStepResults').hidden = true;
        });
    }

    window.AnalysisFetalIap = {
        init: init,
        onShown: loadSchema,
        onDatasetChanged: function () {
            document.getElementById('fetalIapStepResults').hidden = true;
            loadSchema();
        }
    };
})();
