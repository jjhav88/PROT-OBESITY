/**
 * Panel Métodos utilizados — síntesis para Materiales y métodos.
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let cachedDoc = null;

    async function loadDocument() {
        if (cachedDoc) return cachedDoc;
        const res = await fetch(API() + '/prelim/metodos');
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'No se pudo cargar el documento de métodos');
        cachedDoc = data;
        return data;
    }

    function renderSection(sec) {
        let h = '<section class="analysis-metodos-section" id="metodos-' + App().escapeHtml(sec.id) + '">';
        h += '<h4 class="analysis-metodos-heading">' + App().escapeHtml(sec.title) + '</h4>';
        (sec.paragraphs || []).forEach(function (p) {
            h += '<p class="analysis-metodos-p">' + App().escapeHtml(p) + '</p>';
        });
        (sec.subsections || []).forEach(function (sub) {
            h += '<h5 class="analysis-metodos-subheading">' + App().escapeHtml(sub.title) + '</h5>';
            if (sub.bullets && sub.bullets.length) {
                h += '<ul class="analysis-metodos-list">';
                sub.bullets.forEach(function (b) {
                    h += '<li>' + App().escapeHtml(b) + '</li>';
                });
                h += '</ul>';
            }
        });
        if (sec.bullets && sec.bullets.length) {
            h += '<ul class="analysis-metodos-list">';
            sec.bullets.forEach(function (b) {
                h += '<li>' + App().escapeHtml(b) + '</li>';
            });
            h += '</ul>';
        }
        h += '</section>';
        return h;
    }

    function renderReview(notes) {
        if (!notes || !notes.length) return '';
        let h = '<section class="analysis-metodos-review"><h4 class="analysis-metodos-heading">Notas de verificación técnica</h4><ul class="analysis-metodos-list">';
        notes.forEach(function (n) {
            h += '<li>' + App().escapeHtml(n) + '</li>';
        });
        h += '</ul><p class="analysis-metodos-note"><em>Estas notas son para revisión interna; no es necesario incluirlas en la disertación.</em></p></section>';
        return h;
    }

    async function renderPanel() {
        const mount = document.getElementById('analysisPrelimMetodosMount');
        if (!mount) return;
        try {
            const doc = await loadDocument();
            let h = '<div class="analysis-metodos-doc">';
            h += '<header class="analysis-metodos-header">';
            h += '<h3>' + App().escapeHtml(doc.title) + '</h3>';
            h += '<p class="analysis-metodos-lead">' + App().escapeHtml(doc.subtitle || '') + '</p>';
            h += '<p class="analysis-metodos-intro">' + App().escapeHtml(doc.intro || '') + '</p>';
            h += '<div class="analysis-metodos-actions">';
            h +=
                '<button type="button" class="analysis-btn analysis-btn-primary" id="metodosCopyMarkdownBtn"><i class="fas fa-copy"></i> Copiar texto (Markdown)</button>';
            h +=
                '<button type="button" class="analysis-btn analysis-btn-secondary" id="metodosCopyPlainBtn"><i class="fas fa-file-alt"></i> Copiar texto plano</button>';
            h += '</div></header>';
            h += '<nav class="analysis-metodos-toc"><strong>Contenido</strong><ul>';
            (doc.sections || []).forEach(function (sec) {
                h +=
                    '<li><a href="#metodos-' +
                    App().escapeHtml(sec.id) +
                    '">' +
                    App().escapeHtml(sec.title) +
                    '</a></li>';
            });
            h += '</ul></nav>';
            (doc.sections || []).forEach(function (sec) {
                h += renderSection(sec);
            });
            h += renderReview(doc.review_notes);
            h += '</div>';
            mount.innerHTML = h;

            document.getElementById('metodosCopyMarkdownBtn')?.addEventListener('click', function () {
                copyText(doc.markdown || '', 'Markdown copiado al portapapeles');
            });
            document.getElementById('metodosCopyPlainBtn')?.addEventListener('click', function () {
                copyText(markdownToPlain(doc.markdown || ''), 'Texto plano copiado');
            });
        } catch (e) {
            mount.innerHTML = '<p class="analysis-metodos-error">' + App().escapeHtml(e.message) + '</p>';
        }
    }

    function markdownToPlain(md) {
        return md
            .replace(/^### /gm, '')
            .replace(/^## /gm, '')
            .replace(/^#### /gm, '')
            .replace(/^- /gm, '• ')
            .replace(/\*\*/g, '');
    }

    function copyText(text, okMsg) {
        if (!text) return;
        navigator.clipboard
            .writeText(text)
            .then(function () {
                App().showToast(okMsg, 'success');
            })
            .catch(function () {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    App().showToast(okMsg, 'success');
                } catch (err) {
                    App().showToast('No se pudo copiar', 'error');
                }
                ta.remove();
            });
    }

    function init() {
        document.getElementById('tabPrelimMetodos')?.addEventListener('click', function () {
            renderPanel();
        });
    }

    window.AnalysisPrelimMetodos = { init: init, renderPanel: renderPanel };
})();
