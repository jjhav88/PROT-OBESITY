/**
 * Módulo ENI-2 — expander y futura lógica (separado de static/script.js)
 */

(function initEni2ExpanderClosed() {
    const content = document.getElementById('eni2ExpanderContent');
    const icon = document.getElementById('eni2ExpanderIcon');
    if (!content || !icon) return;
    content.style.maxHeight = '0';
    content.classList.remove('expanded');
    icon.classList.remove('expanded');
})();

function recalculateEni2ExpanderHeight() {
    const content = document.getElementById('eni2ExpanderContent');
    if (!content || !content.classList.contains('expanded')) return;
    content.style.maxHeight = content.scrollHeight + 'px';
}

window.toggleEni2Expander = function () {
    const content = document.getElementById('eni2ExpanderContent');
    const icon = document.getElementById('eni2ExpanderIcon');
    if (!content || !icon) return;

    if (content.classList.contains('expanded')) {
        content.style.maxHeight = `${content.scrollHeight}px`;
        void content.offsetHeight;
        content.classList.remove('expanded');
        icon.classList.remove('expanded');
        requestAnimationFrame(() => {
            content.style.maxHeight = '0';
        });
    } else {
        content.classList.add('expanded');
        icon.classList.add('expanded');
        content.style.maxHeight = content.scrollHeight + 'px';
        window.setTimeout(() => recalculateEni2ExpanderHeight(), 350);
    }
};
