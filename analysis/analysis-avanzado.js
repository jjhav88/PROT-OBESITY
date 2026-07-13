/**
 * Módulo 3 — Análisis avanzado (contenedor y pestañas internas).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;

    function getDatasetId() {
        const ds = App().state.activeDataset;
        return ds && ds.id ? ds.id : null;
    }

    function showNoData(show) {
        const empty = document.getElementById('analysisAvanzNoData');
        const content = document.getElementById('analysisAvanzContent');
        if (empty) empty.hidden = !show;
        if (content) content.hidden = show;
    }

    function activateAvanzSubmodule(submoduleId) {
        document.querySelectorAll('.analysis-avanz-subtab').forEach(function (tab) {
            const match = tab.getAttribute('data-avanz-submodule') === submoduleId;
            tab.classList.toggle('active', match);
            tab.setAttribute('aria-selected', match ? 'true' : 'false');
        });
        document.querySelectorAll('.analysis-avanz-submodule').forEach(function (panel) {
            const match = panel.getAttribute('data-avanz-submodule') === submoduleId;
            panel.classList.toggle('active', match);
            panel.hidden = !match;
        });
        if (submoduleId === 'pca' && window.AnalysisAvanzadoPca && window.AnalysisAvanzadoPca.onSubmoduleShown) {
            window.AnalysisAvanzadoPca.onSubmoduleShown();
        }
        if (submoduleId === 'mediation' && window.AnalysisAvanzadoMediation && window.AnalysisAvanzadoMediation.onSubmoduleShown) {
            window.AnalysisAvanzadoMediation.onSubmoduleShown();
        }
    }

    function initAvanzSubmodules() {
        document.querySelectorAll('.analysis-avanz-subtab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                activateAvanzSubmodule(tab.getAttribute('data-avanz-submodule'));
            });
        });
        const active = document.querySelector('.analysis-avanz-subtab.active');
        activateAvanzSubmodule(active ? active.getAttribute('data-avanz-submodule') : 'pca');
    }

    function onModuleShown() {
        if (getDatasetId()) {
            showNoData(false);
            if (window.AnalysisAvanzadoPca && window.AnalysisAvanzadoPca.loadSchema) {
                window.AnalysisAvanzadoPca.loadSchema();
            }
        } else {
            showNoData(true);
        }
    }

    function init() {
        initAvanzSubmodules();
        document.getElementById('tabPrelimAvanzado')?.addEventListener('click', onModuleShown);
        if (getDatasetId()) {
            showNoData(false);
        } else {
            showNoData(true);
        }
        if (window.AnalysisAvanzadoPca && window.AnalysisAvanzadoPca.init) {
            window.AnalysisAvanzadoPca.init();
        }
        if (window.AnalysisAvanzadoMediation && window.AnalysisAvanzadoMediation.init) {
            window.AnalysisAvanzadoMediation.init();
        }
    }

    function onDatasetChanged() {
        if (getDatasetId()) {
            showNoData(false);
        } else {
            showNoData(true);
        }
        if (window.AnalysisAvanzadoPca && window.AnalysisAvanzadoPca.onDatasetChanged) {
            window.AnalysisAvanzadoPca.onDatasetChanged();
        }
        if (window.AnalysisAvanzadoMediation && window.AnalysisAvanzadoMediation.onDatasetChanged) {
            window.AnalysisAvanzadoMediation.onDatasetChanged();
        }
    }

    window.AnalysisAvanzado = {
        init: init,
        onDatasetChanged: onDatasetChanged,
        onModuleShown: onModuleShown
    };
})();
