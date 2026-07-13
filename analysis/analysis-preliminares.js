/**
 * Análisis de Datos — Resultados Preliminares (carga BD, vista previa, tipos de variable).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let pendingTypeChanges = {};
    let saveTypeTimer = null;

    async function init() {
        bindUpload();
        await refreshActive();
        await loadDatasetsList();
    }

    function bindUpload() {
        const zone = document.getElementById('analysisUploadZone');
        const input = document.getElementById('analysisFileInput');
        const btnPick = document.getElementById('analysisPickFileBtn');

        if (!zone || !input) return;

        zone.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            input.click();
        });

        if (btnPick) {
            btnPick.addEventListener('click', function (e) {
                e.stopPropagation();
                input.click();
            });
        }

        input.addEventListener('change', function () {
            if (input.files && input.files[0]) uploadFile(input.files[0]);
            input.value = '';
        });

        zone.addEventListener('dragover', function (e) {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', function () {
            zone.classList.remove('dragover');
        });
        zone.addEventListener('drop', function (e) {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) uploadFile(file);
        });

        const btnRemove = document.getElementById('analysisRemoveActiveBtn');
        if (btnRemove) {
            btnRemove.addEventListener('click', removeActiveDataset);
        }
    }

    async function uploadFile(file) {
        if (!/\.(xlsx|xls)$/i.test(file.name)) {
            App().showToast('Solo archivos Excel (.xlsx, .xls)', 'error');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            App().showToast('El archivo supera 50 MB', 'error');
            return;
        }

        App().showLoading('Cargando base de datos...');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(API() + '/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Error al cargar el archivo');
            }
            if (!data.success) throw new Error('No se pudo procesar el archivo');

            pendingTypeChanges = {};
            App().state.activeDataset = data.dataset;
            renderDataset(data.dataset);
            await loadDatasetsList();
            App().showToast('Base de datos cargada correctamente', 'success');
        } catch (err) {
            App().showToast(err.message || 'Error de carga', 'error');
            console.error(err);
        } finally {
            App().hideLoading();
        }
    }

    async function refreshActive() {
        try {
            const res = await fetch(API() + '/active');
            const data = await res.json();
            if (data.success && data.active) {
                pendingTypeChanges = {};
                App().state.activeDataset = data.active;
                renderDataset(data.active);
            } else {
                App().state.activeDataset = null;
                showEmptyWorkspace();
            }
        } catch (err) {
            console.error(err);
            showEmptyWorkspace();
        }
    }

    async function loadDatasetsList() {
        const mount = document.getElementById('analysisDatasetsList');
        if (!mount) return;

        try {
            const res = await fetch(API() + '/datasets');
            const data = await res.json();
            if (!data.success || !data.datasets || !data.datasets.length) {
                mount.innerHTML = '<p class="analysis-preview-note">Aún no hay bases guardadas en este módulo.</p>';
                return;
            }

            const activeId = data.active_dataset_id;
            mount.innerHTML = data.datasets
                .map(function (ds) {
                    const isActive = ds.id === activeId;
                    return (
                        '<div class="analysis-dataset-item' +
                        (isActive ? ' is-active' : '') +
                        '">' +
                        '<div><div class="name">' +
                        App().escapeHtml(ds.original_filename) +
                        (isActive ? ' <span class="analysis-type-badge manual">Activa</span>' : '') +
                        '</div>' +
                        '<div class="details">' +
                        App().escapeHtml(String(ds.rows)) +
                        ' filas · ' +
                        App().escapeHtml(String(ds.column_count)) +
                        ' variables · ' +
                        App().escapeHtml(App().formatDate(ds.updated_at || ds.created_at)) +
                        '</div></div>' +
                        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                        (isActive
                            ? ''
                            : '<button type="button" class="analysis-btn analysis-btn-secondary" data-activate="' +
                              App().escapeHtml(ds.id) +
                              '"><i class="fas fa-check"></i> Usar</button>') +
                        '<button type="button" class="analysis-btn analysis-btn-danger" data-delete="' +
                        App().escapeHtml(ds.id) +
                        '" data-delete-name="' +
                        App().escapeHtml(ds.original_filename) +
                        '"><i class="fas fa-trash"></i></button>' +
                        '</div></div>'
                    );
                })
                .join('');

            mount.querySelectorAll('[data-activate]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    activateDataset(btn.getAttribute('data-activate'));
                });
            });
            mount.querySelectorAll('[data-delete]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    deleteDataset(btn.getAttribute('data-delete'), btn.getAttribute('data-delete-name'));
                });
            });
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">No se pudo cargar el historial.</p>';
        }
    }

    async function activateDataset(id) {
        App().showLoading('Activando base de datos...');
        try {
            const res = await fetch(API() + '/active/' + encodeURIComponent(id), { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Error');
            await refreshActive();
            await loadDatasetsList();
            App().showToast('Base de datos activa', 'success');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function deleteDataset(id, displayName) {
        const name = displayName ? String(displayName) : 'esta base';
        const ok = await App().confirm({
            title: 'Eliminar base de datos',
            message:
                '¿Eliminar «' +
                name +
                '» del módulo de análisis? Los metadatos y la copia guardada se borrarán. Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            variant: 'danger'
        });
        if (!ok) return;
        App().showLoading('Eliminando...');
        try {
            const res = await fetch(API() + '/datasets/' + encodeURIComponent(id), { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Error');
            pendingTypeChanges = {};
            await refreshActive();
            await loadDatasetsList();
            App().showToast('Base eliminada', 'info');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function removeActiveDataset() {
        const ds = App().state.activeDataset;
        if (!ds) return;
        await deleteDataset(ds.id, ds.original_filename);
    }

    function showEmptyWorkspace() {
        const banner = document.getElementById('analysisActiveBanner');
        const preview = document.getElementById('analysisPreviewSection');
        const vars = document.getElementById('analysisVariablesSection');
        if (banner) banner.hidden = true;
        if (preview) preview.hidden = true;
        if (vars) vars.hidden = true;
        if (window.AnalysisDescriptivo && window.AnalysisDescriptivo.onDatasetChanged) {
            window.AnalysisDescriptivo.onDatasetChanged();
        }
        if (window.AnalysisInferencial && window.AnalysisInferencial.onDatasetChanged) {
            window.AnalysisInferencial.onDatasetChanged();
        }
        if (window.AnalysisAvanzado && window.AnalysisAvanzado.onDatasetChanged) {
            window.AnalysisAvanzado.onDatasetChanged();
        }
        if (window.AnalysisFetal && window.AnalysisFetal.onDatasetChanged) {
            window.AnalysisFetal.onDatasetChanged();
        }
    }

    function renderDataset(dataset) {
        if (!dataset) {
            showEmptyWorkspace();
            return;
        }

        const banner = document.getElementById('analysisActiveBanner');
        const preview = document.getElementById('analysisPreviewSection');
        const vars = document.getElementById('analysisVariablesSection');

        if (banner) {
            banner.hidden = false;
            document.getElementById('analysisActiveFilename').textContent = dataset.original_filename || '—';
            document.getElementById('analysisActiveRows').textContent = String(dataset.rows || 0);
            document.getElementById('analysisActiveCols').textContent = String(dataset.column_count || 0);
            document.getElementById('analysisActiveUpdated').textContent = App().formatDate(dataset.updated_at);
        }

        renderPreview(dataset.preview, dataset.columns);
        renderVariablesTable(dataset);

        if (preview) preview.hidden = false;
        if (vars) vars.hidden = false;

        if (window.AnalysisDescriptivo && window.AnalysisDescriptivo.onDatasetChanged) {
            window.AnalysisDescriptivo.onDatasetChanged();
        }
        if (window.AnalysisInferencial && window.AnalysisInferencial.onDatasetChanged) {
            window.AnalysisInferencial.onDatasetChanged();
        }
        if (window.AnalysisAvanzado && window.AnalysisAvanzado.onDatasetChanged) {
            window.AnalysisAvanzado.onDatasetChanged();
        }
        if (window.AnalysisFetal && window.AnalysisFetal.onDatasetChanged) {
            window.AnalysisFetal.onDatasetChanged();
        }
    }

    function renderPreview(preview, columns) {
        const head = document.getElementById('analysisPreviewHead');
        const body = document.getElementById('analysisPreviewBody');
        const note = document.getElementById('analysisPreviewNote');
        if (!head || !body) return;

        const cols = (preview && preview.columns) || columns || [];
        const rows = (preview && preview.data) || [];
        const total = (preview && preview.total_rows) || rows.length;

        head.innerHTML =
            '<tr>' + cols.map(function (c) { return '<th>' + App().escapeHtml(c) + '</th>'; }).join('') + '</tr>';

        body.innerHTML = rows
            .map(function (row) {
                return (
                    '<tr>' +
                    cols
                        .map(function (c) {
                            const v = row[c];
                            return '<td title="' + App().escapeHtml(String(v ?? '')) + '">' + App().escapeHtml(String(v ?? '')) + '</td>';
                        })
                        .join('') +
                    '</tr>'
                );
            })
            .join('');

        if (note) {
            note.textContent =
                rows.length >= 10 && total > 10
                    ? 'Vista previa: primeras 10 filas de ' + total + ' registros.'
                    : 'Vista previa: ' + total + ' registro(s).';
        }
    }

    function renderVariablesTable(dataset) {
        const tbody = document.getElementById('analysisVariablesBody');
        if (!tbody) return;

        const labels = App().state.typeLabels;
        const options = App().state.typeOptions.length
            ? App().state.typeOptions
            : ['numeric_discrete', 'numeric_continuous', 'categorical_nominal', 'categorical_dichotomous'];

        tbody.innerHTML = (dataset.variables || [])
            .map(function (v, idx) {
                const opts = options
                    .map(function (key) {
                        const sel = v.type === key ? ' selected' : '';
                        return (
                            '<option value="' +
                            App().escapeHtml(key) +
                            '"' +
                            sel +
                            '>' +
                            App().escapeHtml(labels[key] || key) +
                            '</option>'
                        );
                    })
                    .join('');

                return (
                    '<tr data-var="' +
                    App().escapeHtml(v.name) +
                    '">' +
                    '<td>' +
                    (idx + 1) +
                    '</td>' +
                    '<td><strong>' +
                    App().escapeHtml(v.name) +
                    '</strong></td>' +
                    '<td class="col-type">' +
                    '<select class="analysis-type-select" data-column="' +
                    App().escapeHtml(v.name) +
                    '" aria-label="Tipo de ' +
                    App().escapeHtml(v.name) +
                    '">' +
                    opts +
                    '</select>' +
                    '</td>' +
                    '<td>' +
                    App().escapeHtml(String(v.unique_count)) +
                    '</td>' +
                    '<td>' +
                    App().escapeHtml(String(v.missing_count)) +
                    '</td>' +
                    '</tr>'
                );
            })
            .join('');

        tbody.querySelectorAll('.analysis-type-select').forEach(function (sel) {
            sel.addEventListener('change', onTypeChange);
        });
    }

    function onTypeChange(ev) {
        const sel = ev.target;
        const col = sel.getAttribute('data-column');
        const newType = sel.value;
        sel.classList.add('dirty');

        pendingTypeChanges[col] = newType;

        if (saveTypeTimer) clearTimeout(saveTypeTimer);
        saveTypeTimer = setTimeout(function () {
            persistTypeChanges();
        }, 600);
    }

    async function persistTypeChanges() {
        const ds = App().state.activeDataset;
        if (!ds || !Object.keys(pendingTypeChanges).length) return;

        const payload = { variable_types: Object.assign({}, pendingTypeChanges) };
        const toSave = Object.assign({}, pendingTypeChanges);
        pendingTypeChanges = {};

        try {
            const res = await fetch(API() + '/datasets/' + encodeURIComponent(ds.id) + '/variable-types', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'No se guardaron los tipos');

            App().state.activeDataset = data.dataset;
            document.querySelectorAll('.analysis-type-select.dirty').forEach(function (sel) {
                if (toSave[sel.getAttribute('data-column')]) {
                    sel.classList.remove('dirty');
                }
            });
            renderVariablesTable(data.dataset);
            await loadDatasetsList();
            App().showToast('Tipo de variable guardado', 'success');
        } catch (err) {
            Object.assign(pendingTypeChanges, toSave);
            App().showToast(err.message || 'Error al guardar', 'error');
        }
    }

    window.AnalysisPreliminares = {
        init: init,
        refreshActive: refreshActive
    };
})();
