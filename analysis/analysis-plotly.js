/**
 * Configuración Plotly compartida: barra de herramientas, zoom y pantalla completa.
 */
(function () {
    'use strict';

    if (!window.Plotly) {
        return;
    }

    var CHART_WRAP_SEL = '.analysis-chart, .analysis-avanz-chart';
    var layoutSnapshots = new WeakMap();

    function getPlotFromFullscreenEl(fsEl) {
        if (!fsEl) {
            return null;
        }
        if (fsEl.classList && fsEl.classList.contains('js-plotly-plot')) {
            return fsEl;
        }
        return fsEl.querySelector ? fsEl.querySelector('.js-plotly-plot') : null;
    }

    function cloneLayoutPart(obj) {
        if (obj == null) {
            return obj;
        }
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return obj;
        }
    }

    function snapshotLayout(gd) {
        if (!gd || !gd.layout || layoutSnapshots.has(gd)) {
            return;
        }
        var lay = gd.layout;
        layoutSnapshots.set(gd, {
            margin: cloneLayoutPart(lay.margin),
            title: cloneLayoutPart(
                typeof lay.title === 'object' && lay.title !== null ? lay.title : { text: lay.title }
            ),
            legend: lay.legend ? cloneLayoutPart(lay.legend) : undefined,
            showlegend: lay.showlegend,
            height: lay.height,
            autosize: lay.autosize !== false,
            width: lay.width
        });
    }

    function titleLayoutPatch(gd) {
        var base =
            typeof gd.layout.title === 'object' && gd.layout.title !== null
                ? Object.assign({}, gd.layout.title)
                : { text: gd.layout.title || '' };
        return Object.assign(
            {
                x: 0.5,
                xanchor: 'center',
                pad: { t: 12, b: 6 }
            },
            base
        );
    }

    function legendLayoutPatch(gd) {
        var base = Object.assign({ orientation: 'h' }, gd.layout.legend || {});
        return Object.assign(
            {
                x: 0.5,
                xanchor: 'center',
                y: 1.06,
                yanchor: 'bottom',
                bgcolor: 'rgba(255,255,255,0.95)',
                borderwidth: 0
            },
            base
        );
    }

    function resetChartContainer(gd) {
        var wrap = gd && gd.closest ? gd.closest(CHART_WRAP_SEL) : null;
        if (wrap) {
            clearPlotInlineSizes(wrap);
        }
        clearPlotInlineSizes(gd);
    }

    function relayoutToContainerWidth(gd) {
        if (!gd || !gd.layout) {
            return Promise.resolve();
        }
        var wrap = gd.closest ? gd.closest(CHART_WRAP_SEL) : null;
        var patch = { autosize: true };
        if (wrap) {
            var w = Math.floor(wrap.getBoundingClientRect().width);
            if (w > 40) {
                patch.width = w;
            }
        }
        if (gd.layout.height) {
            patch.height = gd.layout.height;
        }
        return window.Plotly.relayout(gd, patch).then(function () {
            resizePlot(gd);
        });
    }

    function applyFullscreenLayout(gd) {
        if (!gd || !gd.layout) {
            return Promise.resolve();
        }
        snapshotLayout(gd);
        var margin = Object.assign({}, gd.layout.margin || {}, { t: 165, b: 56, l: 64, r: 40 });
        var patch = {
            margin: margin,
            title: titleLayoutPatch(gd)
        };
        if (gd.layout.showlegend !== false && (gd.layout.legend || (gd.data && gd.data.length > 1))) {
            patch.showlegend = true;
            patch.legend = legendLayoutPatch(gd);
        }
        return window.Plotly.relayout(gd, patch);
    }

    function restoreLayout(gd) {
        if (!gd || !gd.layout) {
            return Promise.resolve();
        }
        var saved = layoutSnapshots.get(gd);
        layoutSnapshots.delete(gd);
        if (!saved) {
            return Promise.resolve();
        }
        var patch = {};
        if (saved.margin) {
            patch.margin = saved.margin;
        }
        if (saved.title !== undefined) {
            patch.title = saved.title;
        }
        if (saved.legend !== undefined) {
            patch.legend = saved.legend;
        }
        if (saved.showlegend !== undefined) {
            patch.showlegend = saved.showlegend;
        }
        if (saved.height !== undefined) {
            patch.height = saved.height;
        }
        patch.autosize = saved.autosize !== false;
        return window.Plotly.relayout(gd, patch).then(function () {
            resetChartContainer(gd);
            return relayoutToContainerWidth(gd);
        });
    }

    function clearPlotInlineSizes(root) {
        if (!root) {
            return;
        }
        root.style.removeProperty('width');
        root.style.removeProperty('height');
        root.style.removeProperty('min-height');
        root.style.removeProperty('max-width');
        root.style.removeProperty('min-width');
        root.style.removeProperty('flex');
        root.querySelectorAll('.main-svg, .svg-container').forEach(function (node) {
            node.style.removeProperty('width');
            node.style.removeProperty('height');
        });
    }

    function resizePlot(el) {
        if (!el || !window.Plotly || !window.Plotly.Plots) {
            return;
        }
        try {
            window.Plotly.Plots.resize(el);
        } catch (err) {
            /* ignore */
        }
    }

    function resizeAllPlots() {
        document.querySelectorAll('.js-plotly-plot').forEach(resizePlot);
    }

    function restoreAfterFullscreen() {
        var plots = [];
        document.querySelectorAll(CHART_WRAP_SEL).forEach(function (wrap) {
            var plot = getPlotFromFullscreenEl(wrap);
            if (plot) {
                plots.push(plot);
            }
        });
        document.querySelectorAll('.js-plotly-plot').forEach(function (plot) {
            if (plots.indexOf(plot) < 0) {
                plots.push(plot);
            }
        });

        Promise.all(plots.map(restoreLayout)).then(function () {
            document.querySelectorAll(CHART_WRAP_SEL).forEach(clearPlotInlineSizes);
            document.querySelectorAll('.js-plotly-plot').forEach(function (gd) {
                clearPlotInlineSizes(gd);
                relayoutToContainerWidth(gd);
            });

            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    setTimeout(function () {
                        resizeAllPlots();
                        window.dispatchEvent(new Event('resize'));
                    }, 100);
                });
            });
        });
    }

    function onFullscreenChange() {
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) {
            var plot = getPlotFromFullscreenEl(fsEl);
            if (!plot) {
                return;
            }
            applyFullscreenLayout(plot).then(function () {
                requestAnimationFrame(function () {
                    resizePlot(plot);
                });
            });
            return;
        }
        restoreAfterFullscreen();
    }

    var FULLSCREEN_BTN = {
        name: 'analysisFullscreen',
        title: 'Pantalla completa (Esc para salir)',
        icon: {
            width: 1000,
            height: 1000,
            path:
                'M128 128h192v192h-128v-128h-64zm384 0h64v128h128v64h-192v-192zm128 384v64h-128v128h-192v-192h128zm-384 128v-192h128v-128h64v192h-192z'
        },
        click: function (gd) {
            var target = gd.closest ? gd.closest(CHART_WRAP_SEL) : null;
            if (!target) {
                target = gd;
            }
            var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsEl) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
                return;
            }
            var req = target.requestFullscreen || target.webkitRequestFullscreen;
            if (!req) {
                return;
            }
            var p = req.call(target);
            if (p && typeof p.then === 'function') {
                p.then(function () {
                    var plot = getPlotFromFullscreenEl(target) || gd;
                    applyFullscreenLayout(plot).then(function () {
                        requestAnimationFrame(function () {
                            resizePlot(plot);
                        });
                    });
                });
            }
        }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    function config(overrides) {
        var base = {
            responsive: true,
            displayModeBar: 'hover',
            displaylogo: false,
            scrollZoom: true,
            doubleClick: 'reset',
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            modeBarButtonsToAdd: [[FULLSCREEN_BTN]]
        };
        if (!overrides) {
            return base;
        }
        var out = {};
        Object.keys(base).forEach(function (k) {
            out[k] = base[k];
        });
        Object.keys(overrides).forEach(function (k) {
            out[k] = overrides[k];
        });
        return out;
    }

    /**
     * Título en el margen superior (fuera del área de trazado).
     * Combinar con margin.t amplio (p. ej. 140–180).
     */
    function plotTitle(text, opts) {
        opts = opts || {};
        return Object.assign(
            {
                text: text,
                x: 0.5,
                xanchor: 'center',
                pad: { t: 12, b: 6 }
            },
            opts
        );
    }

    /**
     * Leyenda justo debajo del título, encima del área de datos (y=1, anclada abajo).
     */
    function legendBelowTitle(opts) {
        opts = opts || {};
        return Object.assign(
            {
                orientation: 'h',
                x: 0.5,
                xanchor: 'center',
                y: 1.06,
                yanchor: 'bottom',
                bgcolor: 'rgba(255,255,255,0.95)',
                borderwidth: 0
            },
            opts
        );
    }

    window.AnalysisPlotly = {
        config: config,
        fullscreenButton: FULLSCREEN_BTN,
        restoreAfterFullscreen: restoreAfterFullscreen,
        plotTitle: plotTitle,
        legendBelowTitle: legendBelowTitle
    };

    if (window.AnalysisApp) {
        window.AnalysisApp.plotlyConfig = config;
        window.AnalysisApp.plotTitle = plotTitle;
        window.AnalysisApp.legendBelowTitle = legendBelowTitle;
    }
})();
