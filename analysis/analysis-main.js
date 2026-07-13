/**
 * Análisis de Datos — núcleo: pestañas, utilidades, arranque.
 */
(function () {
    'use strict';

    const API = '/api/analysis';

    window.AnalysisApp = {
        API,
        state: {
            activeDataset: null,
            typeLabels: {},
            typeOptions: []
        }
    };

    function showToast(message, type) {
        type = type || 'success';
        let container = document.getElementById('analysisToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'analysisToastContainer';
            container.className = 'analysis-toast-container';
            document.body.appendChild(container);
        }
        const el = document.createElement('div');
        el.className = 'analysis-toast ' + type;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(function () {
            el.remove();
        }, 4200);
    }

    function showLoading(text) {
        const overlay = document.getElementById('analysisLoadingOverlay');
        const label = document.getElementById('analysisLoadingText');
        if (overlay) {
            overlay.classList.add('visible');
            overlay.setAttribute('aria-hidden', 'false');
        }
        if (label) label.textContent = text || 'Procesando...';
    }

    function hideLoading() {
        const overlay = document.getElementById('analysisLoadingOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function formatDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('es-MX', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return iso;
        }
    }

    let confirmResolve = null;

    function confirmDialog(options) {
        options = options || {};
        const modal = document.getElementById('analysisConfirmModal');
        const titleEl = document.getElementById('analysisConfirmTitle');
        const messageEl = document.getElementById('analysisConfirmMessage');
        const iconEl = document.getElementById('analysisConfirmIcon');
        const okBtn = document.getElementById('analysisConfirmOkBtn');
        const cancelBtn = document.getElementById('analysisConfirmCancelBtn');
        if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
            return Promise.resolve(false);
        }

        const variant = options.variant === 'danger' ? 'danger' : 'default';
        const title = options.title || 'Confirmar acción';
        const message = options.message || '¿Desea continuar?';
        const confirmText = options.confirmText || 'Aceptar';
        const cancelText = options.cancelText || 'Cancelar';

        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        modal.classList.remove('analysis-confirm-modal--danger', 'analysis-confirm-modal--default');
        modal.classList.add(variant === 'danger' ? 'analysis-confirm-modal--danger' : 'analysis-confirm-modal--default');

        if (iconEl) {
            const icon = iconEl.querySelector('i');
            if (icon) {
                icon.className =
                    variant === 'danger' ? 'fas fa-trash-alt' : 'fas fa-question-circle';
            }
        }

        return new Promise(function (resolve) {
            if (confirmResolve) {
                confirmResolve(false);
            }
            confirmResolve = resolve;

            function finish(result) {
                modal.classList.remove('visible');
                modal.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('analysis-confirm-open');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                modal.querySelectorAll('[data-confirm-cancel]').forEach(function (el) {
                    el.removeEventListener('click', onCancel);
                });
                document.removeEventListener('keydown', onKey);
                confirmResolve = null;
                resolve(result);
            }

            function onOk() {
                finish(true);
            }

            function onCancel() {
                finish(false);
            }

            function onKey(e) {
                if (e.key === 'Escape') onCancel();
            }

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            modal.querySelectorAll('[data-confirm-cancel]').forEach(function (el) {
                el.addEventListener('click', onCancel);
            });
            document.addEventListener('keydown', onKey);

            modal.classList.add('visible');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('analysis-confirm-open');
            cancelBtn.focus();
        });
    }

    window.AnalysisApp.showToast = showToast;
    window.AnalysisApp.showLoading = showLoading;
    window.AnalysisApp.hideLoading = hideLoading;
    window.AnalysisApp.escapeHtml = escapeHtml;
    window.AnalysisApp.formatDate = formatDate;
    window.AnalysisApp.confirm = confirmDialog;

    function initPhaseTabs() {
        const tabs = document.querySelectorAll('.analysis-phase-tab');
        const panels = document.querySelectorAll('.analysis-phase-panel');

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                const phase = tab.getAttribute('data-phase');
                if (!phase || tab.disabled) return;

                tabs.forEach(function (t) {
                    t.classList.toggle('active', t === tab);
                    t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
                });

                panels.forEach(function (panel) {
                    const match = panel.id === 'analysisPanel' + capitalize(phase);
                    panel.classList.toggle('active', match);
                    panel.hidden = !match;
                });
            });
        });
    }

    function capitalize(s) {
        if (!s) return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    async function loadTypeLabels() {
        try {
            const res = await fetch(API + '/variable-type-labels');
            const data = await res.json();
            if (data.success) {
                window.AnalysisApp.state.typeLabels = data.labels || {};
                window.AnalysisApp.state.typeOptions = data.types || [];
            }
        } catch (e) {
            console.warn('No se cargaron etiquetas de tipos', e);
        }
    }

    async function bootstrap() {
        initPhaseTabs();
        if (window.AnalysisPrelimTabs && window.AnalysisPrelimTabs.init) {
            window.AnalysisPrelimTabs.init();
        }
        if (window.AnalysisPrelimMetodos && window.AnalysisPrelimMetodos.init) {
            window.AnalysisPrelimMetodos.init();
        }
        await loadTypeLabels();

        if (window.AnalysisPreliminares && window.AnalysisPreliminares.init) {
            await window.AnalysisPreliminares.init();
        }
        if (window.AnalysisDescriptivo && window.AnalysisDescriptivo.init) {
            window.AnalysisDescriptivo.init();
        }
        if (window.AnalysisInferencial && window.AnalysisInferencial.init) {
            window.AnalysisInferencial.init();
        }
        if (window.AnalysisAvanzado && window.AnalysisAvanzado.init) {
            window.AnalysisAvanzado.init();
        }
        if (window.AnalysisFetal && window.AnalysisFetal.init) {
            window.AnalysisFetal.init();
        }
        if (window.AnalysisGenerales && window.AnalysisGenerales.init) {
            window.AnalysisGenerales.init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
