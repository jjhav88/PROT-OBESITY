/**
 * Programación fetal — comparar IAP por Condicion (Mann-Whitney).
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

    function fillGroupSelects(s) {
        const selA = document.getElementById('fetalCompareGroupA');
        const selB = document.getElementById('fetalCompareGroupB');
        if (!selA || !selB) return;
        const groups = (s.condicion_groups || []).filter(function (g) {
            return g.ready_for_test;
        });
        const opts = groups
            .map(function (g) {
                return (
                    '<option value="' +
                    App().escapeHtml(g.label) +
                    '">' +
                    App().escapeHtml(g.label) +
                    ' (n=' +
                    g.n +
                    ')</option>'
                );
            })
            .join('');
        selA.innerHTML = opts;
        selB.innerHTML = opts;
        if (s.default_group_a) selA.value = s.default_group_a;
        if (s.default_group_b) selB.value = s.default_group_b;
        const btn = document.getElementById('fetalCompareRunBtn');
        if (btn) btn.disabled = !s.ready;
    }

    function renderGroupsTable(groups, audit) {
        const mount = document.getElementById('fetalCompareGroupsMount');
        if (!mount) return;
        let h =
            '<p class="analysis-infer-table-title">IAP por categoría de Condicion (antes del contraste)</p>';
        h += '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr>';
        h +=
            '<th>Condicion</th><th>n</th><th>Mediana IAP</th><th>Media IAP</th><th>Mín–máx</th><th>≥' +
            (schema && schema.min_group_n ? schema.min_group_n : 8) +
            ' para Mann-Whitney</th>';
        h += '</tr></thead><tbody>';
        (groups || []).forEach(function (g) {
            if (g.n === 0) return;
            h += '<tr><td>' + App().escapeHtml(g.label) + '</td>';
            h += '<td>' + g.n + '</td>';
            h += '<td>' + (g.median != null ? g.median : '—') + '</td>';
            h += '<td>' + (g.mean != null ? g.mean : '—') + '</td>';
            h +=
                '<td>' +
                (g.min != null && g.max != null ? g.min + ' – ' + g.max : '—') +
                '</td>';
            h += '<td>' + (g.ready_for_test ? 'Sí' : 'No') + '</td></tr>';
        });
        h += '</tbody></table></div>';
        if (audit) {
            h +=
                '<p class="analysis-fetal-note"><strong>Verificación de datos:</strong> variable ' +
                App().escapeHtml(audit.factor_variable || 'Condicion') +
                (audit.condicion_column ? ' («' + App().escapeHtml(audit.condicion_column) + '»)' : '') +
                ' · IAP (' +
                App().escapeHtml(audit.outcome_variable || 'iap_total') +
                ') · ' +
                audit.n_with_iap_and_condicion +
                ' niños con IAP y Condicion · ' +
                audit.n_missing_iap +
                ' sin IAP · ' +
                audit.n_missing_condicion +
                ' sin Condicion · ' +
                audit.n_excluded_unknown_condicion +
                ' excluidos (categoría no estándar).</p>';
        }
        mount.innerHTML = h;
    }

    function renderInterpretationGuide(guide, extraParagraphs) {
        if (!guide) return '';
        let h = '<div class="analysis-fetal-interpret-panel">';
        h += '<h4>' + App().escapeHtml(guide.title) + '</h4><ul>';
        (guide.bullets || []).forEach(function (b) {
            h += '<li>' + App().escapeHtml(b) + '</li>';
        });
        h += '</ul>';
        (extraParagraphs || []).forEach(function (p) {
            h += '<p class="analysis-fetal-interpret-extra">' + App().escapeHtml(p) + '</p>';
        });
        h += '</div>';
        return h;
    }

    function plotBox(groups, chartId, title) {
        if (!window.Plotly || !groups || !groups.length) return;
        const colors = {
            Obesidad: '#dc2626',
            Sobrepeso: '#ea580c',
            Normopeso: '#2563eb',
            'Bajo peso': '#7c3aed'
        };
        const traces = groups.map(function (g) {
            return {
                type: 'box',
                name: g.label,
                y: g.values || [],
                marker: { color: colors[g.label] || '#64748b' },
                boxpoints: 'all',
                jitter: 0.3
            };
        });
        const titleFn = window.AnalysisPlotly && window.AnalysisPlotly.plotTitle;
        Plotly.newPlot(
            chartId,
            traces,
            {
                title: titleFn ? titleFn(title || 'IAP por Condicion') : title || 'IAP por Condicion',
                yaxis: { title: 'IAP (0–6)', dtick: 1 },
                margin: { t: 100, b: 48, l: 56, r: 16 },
                height: 380
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderResults(data) {
        const mount = document.getElementById('fetalCompareResultsMount');
        if (!mount) return;
        const chartId = 'fetalCompareChart-' + Date.now();
        const cmp = data.comparison || {};
        const ga = data.group_a || '';
        const gb = data.group_b || '';

        let h =
            '<p class="analysis-infer-stat-line"><strong>Contraste:</strong> ' +
            App().escapeHtml(ga) +
            ' vs ' +
            App().escapeHtml(gb) +
            ' · variable <strong>Condicion</strong> · resultado <strong>IAP</strong></p>';

        h +=
            '<p class="analysis-infer-stat-line"><strong>' +
            App().escapeHtml(data.test) +
            '</strong>: U=' +
            (cmp.U != null ? cmp.U : '—') +
            ', p=' +
            (cmp.p_value != null ? cmp.p_value : '—') +
            (cmp.rank_biserial_r != null ? ', r=' + cmp.rank_biserial_r : '') +
            (cmp.significant ? ' · <strong>significativo</strong> (α=' + cmp.alpha + ')' : ' · no significativo (α=' + cmp.alpha + ')') +
            '</p>';

        (data.groups || []).forEach(function (g) {
            h +=
                '<p class="analysis-infer-stat-line">' +
                App().escapeHtml(g.label) +
                ': n=' +
                g.n +
                ', mediana=' +
                g.median +
                ', media=' +
                g.mean +
                '</p>';
        });

        if (data.kruskal_wallis && data.kruskal_wallis.p_value != null) {
            h +=
                '<p class="analysis-infer-stat-line"><strong>Exploratorio — Kruskal-Wallis</strong> (todas las categorías con n≥' +
                (schema && schema.min_group_n ? schema.min_group_n : 8) +
                '): H=' +
                data.kruskal_wallis.H +
                ', p=' +
                data.kruskal_wallis.p_value +
                ' · grupos: ' +
                (data.kruskal_wallis.groups_included || []).join(', ') +
                '</p>';
        }

        h +=
            '<p class="analysis-fetal-chart-caption"><strong>Gráfico:</strong> IAP en todas las categorías de Condicion con datos; el contraste estadístico es solo entre ' +
            App().escapeHtml(ga) +
            ' y ' +
            App().escapeHtml(gb) +
            '.</p>';
        h += '<div id="' + chartId + '" class="analysis-fetal-chart"></div>';

        h += '<div class="analysis-fetal-insight"><h4>' + App().escapeHtml(data.insight.title) + '</h4>';
        (data.insight.paragraphs || []).forEach(function (p) {
            h += '<p>' + App().escapeHtml(p) + '</p>';
        });
        h += '</div>';

        if (!cmp.significant) {
            h += renderInterpretationGuide(data.interpretation_guide);
        } else {
            h += renderInterpretationGuide(data.interpretation_guide, [
                'Diferencia significativa: el IAP difiere entre los dos grupos elegidos; valore si el tamaño del efecto (r) es clínicamente relevante además del p.'
            ]);
        }

        mount.innerHTML = h;
        plotBox(
            data.overview_groups || data.groups,
            chartId,
            'IAP por Condicion (Mann-Whitney: ' + ga + ' vs ' + gb + ')'
        );
        document.getElementById('fetalCompareStepResults').hidden = false;
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) return;
        schema = await parseResponse(
            await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/compare/schema')
        );
        const intro = document.getElementById('fetalCompareIntro');
        if (intro) {
            intro.textContent = schema.description || '';
        }
        fillGroupSelects(schema);
        renderGroupsTable(schema.condicion_groups, schema.data_audit);
        document.getElementById('fetalCompareRunBtn').disabled = !schema.ready;
    }

    async function run() {
        const id = getDatasetId();
        if (!id) return;
        const ga = document.getElementById('fetalCompareGroupA')?.value;
        const gb = document.getElementById('fetalCompareGroupB')?.value;
        if (ga === gb) {
            App().showToast('Elija dos grupos distintos de Condicion.', 'error');
            return;
        }
        App().showLoading('Comparando IAP...');
        try {
            const data = await parseResponse(
                await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/fetal/compare/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group_a: ga, group_b: gb })
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
        document.getElementById('fetalCompareRunBtn')?.addEventListener('click', run);
        document.getElementById('fetalCompareBackBtn')?.addEventListener('click', function () {
            document.getElementById('fetalCompareStepResults').hidden = true;
        });
    }

    window.AnalysisFetalCompare = {
        init: init,
        onShown: loadSchema,
        onDatasetChanged: function () {
            document.getElementById('fetalCompareStepResults').hidden = true;
            loadSchema();
        }
    };
})();
