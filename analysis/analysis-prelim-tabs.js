/**
 * Pestañas internas de Resultados Preliminares (Carga de datos, futuras pruebas, etc.).
 */
(function () {
    'use strict';

    const TAB_SEL = '.analysis-prelim-tab';
    const PANEL_SEL = '.analysis-prelim-panel';

    function activateSection(sectionId) {
        if (!sectionId) return;

        document.querySelectorAll(TAB_SEL).forEach(function (tab) {
            const match = tab.getAttribute('data-prelim-section') === sectionId;
            tab.classList.toggle('active', match);
            tab.setAttribute('aria-selected', match ? 'true' : 'false');
        });

        document.querySelectorAll(PANEL_SEL).forEach(function (panel) {
            const match = panel.getAttribute('data-prelim-section') === sectionId;
            panel.classList.toggle('active', match);
            panel.hidden = !match;
        });
    }

    function init() {
        const tabs = document.querySelectorAll(TAB_SEL);
        if (!tabs.length) return;

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                if (tab.disabled) return;
                activateSection(tab.getAttribute('data-prelim-section'));
            });
        });

        const active = document.querySelector(TAB_SEL + '.active');
        const sectionId = active
            ? active.getAttribute('data-prelim-section')
            : tabs[0].getAttribute('data-prelim-section');
        activateSection(sectionId);
    }

    /**
     * Registrar una pestaña y panel adicionales (para futuras pruebas).
     * @param {{ id: string, label: string, icon?: string, badge?: string, panelHtml?: string, disabled?: boolean }} config
     */
    function registerSection(config) {
        const nav = document.querySelector('.analysis-prelim-tabs');
        if (!nav || !config || !config.id) return;

        if (document.querySelector('[data-prelim-section="' + config.id + '"]')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'analysis-prelim-tab';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
        btn.setAttribute('data-prelim-section', config.id);
        btn.id = 'tabPrelim' + config.id.charAt(0).toUpperCase() + config.id.slice(1);
        if (config.disabled) btn.disabled = true;

        const icon = config.icon || 'fa-chart-line';
        btn.innerHTML =
            '<i class="fas ' +
            icon +
            '"></i><span>' +
            (window.AnalysisApp ? window.AnalysisApp.escapeHtml(config.label) : config.label) +
            '</span>' +
            (config.badge
                ? '<span class="tab-badge-soon">' +
                  (window.AnalysisApp ? window.AnalysisApp.escapeHtml(config.badge) : config.badge) +
                  '</span>'
                : '');

        nav.appendChild(btn);

        const host = document.getElementById('analysisPanelPreliminares');
        if (!host) return;

        const panel = document.createElement('div');
        panel.className = 'analysis-prelim-panel';
        panel.id = 'analysisPrelimPanel' + config.id.charAt(0).toUpperCase() + config.id.slice(1);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', btn.id);
        panel.setAttribute('data-prelim-section', config.id);
        panel.hidden = true;
        panel.innerHTML = config.panelHtml || '<p class="analysis-preview-note">Sección en desarrollo.</p>';
        host.appendChild(panel);

        btn.addEventListener('click', function () {
            if (!btn.disabled) activateSection(config.id);
        });
    }

    window.AnalysisPrelimTabs = {
        init: init,
        activate: activateSection,
        registerSection: registerSection
    };
})();
