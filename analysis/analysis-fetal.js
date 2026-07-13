/**
 * Módulo 4 — Programación fetal (contenedor y pestañas).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;

    function getDatasetId() {
        const ds = App().state.activeDataset;
        return ds && ds.id ? ds.id : null;
    }

    function showNoData(show) {
        const empty = document.getElementById('analysisFetalNoData');
        const content = document.getElementById('analysisFetalContent');
        if (empty) empty.hidden = !show;
        if (content) content.hidden = show;
    }

    function activateSubmodule(id) {
        document.querySelectorAll('.analysis-fetal-subtab').forEach(function (tab) {
            const m = tab.getAttribute('data-fetal-submodule') === id;
            tab.classList.toggle('active', m);
            tab.setAttribute('aria-selected', m ? 'true' : 'false');
        });
        document.querySelectorAll('.analysis-fetal-submodule').forEach(function (p) {
            const m = p.getAttribute('data-fetal-submodule') === id;
            p.classList.toggle('active', m);
            p.hidden = !m;
        });
        if (id === 'iap' && window.AnalysisFetalIap) window.AnalysisFetalIap.onShown();
        if (id === 'compare' && window.AnalysisFetalCompare) window.AnalysisFetalCompare.onShown();
        if (id === 'correlate' && window.AnalysisFetalCorrelate) window.AnalysisFetalCorrelate.onShown();
        if (id === 'lasso' && window.AnalysisFetalLasso) window.AnalysisFetalLasso.onShown();
        if (id === 'tree' && window.AnalysisFetalTree) window.AnalysisFetalTree.onShown();
    }

    function init() {
        document.querySelectorAll('.analysis-fetal-subtab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                activateSubmodule(tab.getAttribute('data-fetal-submodule'));
            });
        });
        document.getElementById('tabPrelimFetal')?.addEventListener('click', onModuleShown);
        activateSubmodule('iap');
        if (window.AnalysisFetalIap && window.AnalysisFetalIap.init) window.AnalysisFetalIap.init();
        if (window.AnalysisFetalCompare && window.AnalysisFetalCompare.init) window.AnalysisFetalCompare.init();
        if (window.AnalysisFetalCorrelate && window.AnalysisFetalCorrelate.init) window.AnalysisFetalCorrelate.init();
        if (window.AnalysisFetalLasso && window.AnalysisFetalLasso.init) window.AnalysisFetalLasso.init();
        if (window.AnalysisFetalTree && window.AnalysisFetalTree.init) window.AnalysisFetalTree.init();
        if (getDatasetId()) showNoData(false);
        else showNoData(true);
    }

    function onModuleShown() {
        if (getDatasetId()) {
            showNoData(false);
            const active = document.querySelector('.analysis-fetal-subtab.active');
            activateSubmodule(active ? active.getAttribute('data-fetal-submodule') : 'iap');
        } else showNoData(true);
    }

    function onDatasetChanged() {
        if (getDatasetId()) showNoData(false);
        else showNoData(true);
        if (window.AnalysisFetalIap && window.AnalysisFetalIap.onDatasetChanged) window.AnalysisFetalIap.onDatasetChanged();
        if (window.AnalysisFetalCompare && window.AnalysisFetalCompare.onDatasetChanged) window.AnalysisFetalCompare.onDatasetChanged();
        if (window.AnalysisFetalCorrelate && window.AnalysisFetalCorrelate.onDatasetChanged) window.AnalysisFetalCorrelate.onDatasetChanged();
        if (window.AnalysisFetalLasso && window.AnalysisFetalLasso.onDatasetChanged) window.AnalysisFetalLasso.onDatasetChanged();
        if (window.AnalysisFetalTree && window.AnalysisFetalTree.onDatasetChanged) window.AnalysisFetalTree.onDatasetChanged();
    }

    window.AnalysisFetal = { init: init, onDatasetChanged: onDatasetChanged, onModuleShown: onModuleShown };
})();
