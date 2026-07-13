// Variables globales - Updated 2024
let currentFile = null;
let previewData = null;
let resultsData = null;
let currentLabels = [];
let selectedDatabase = null;
let selectedPatient = null;
let allPatients = [];

/** Edición de medidas ya guardadas en el mismo formulario principal (sin modal) */
window.anthropometricInlineEditMode = false;

/** Tras cerrar el modal de confirmación: 'anthropometric-patients' | 'lipid-patients' | null */
let confirmationModalAfterCloseAction = null;

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupFileUpload();
    setupDragAndDrop();
    checkSystemStatus(); // Verificar estado del sistema
    loadHistory(); // Cargar historial al iniciar
    loadAnthropometricDatabases(); // Cargar bases de datos para medidas antropométricas
}

async function checkSystemStatus() {
    try {
        const response = await fetch('/status');
        const result = await response.json();
        
        if (result.success) {
            if (result.files_count > 0) {
            }
        } else {
            console.error('Error al verificar estado del sistema:', result.error);
        }
    } catch (error) {
        console.error('Error al verificar estado del sistema:', error);
    }
}


// Configurar carga de archivos
function setupFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    
    fileInput.addEventListener('change', handleFileSelect);
    uploadArea.addEventListener('click', () => fileInput.click());
}

// Configurar drag and drop
function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

// Manejar selección de archivo
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Procesar archivo
async function handleFile(file) {
    // Validar tipo de archivo
    if (!file.name.match(/\.(xlsx|xls)$/)) {
        showToast('Solo se permiten archivos Excel (.xlsx, .xls)', 'error');
        return;
    }
    
    // Validar tamaño (máximo 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('El archivo es demasiado grande. Máximo 10MB', 'error');
        return;
    }
    
    currentFile = file;
    showLoading('Cargando archivo...');
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            previewData = result.data;
            showPreview(result);
            hideLoading();
        } else {
            throw new Error(result.detail || 'Error al procesar el archivo');
        }
        
    } catch (error) {
        hideLoading();
        showToast(`Error: ${error.message}`, 'error');
        console.error('Error:', error);
    }
}

// Mostrar vista previa
function showPreview(result) {
    const previewSection = document.getElementById('previewSection');
    const fileInfo = document.getElementById('fileInfo');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    
    // Verificar que los elementos existen
    if (!previewSection) {
        console.error('Elemento previewSection no encontrado');
        return;
    }
    if (!fileInfo) {
        console.error('Elemento fileInfo no encontrado');
        return;
    }
    if (!tableHead) {
        console.error('Elemento tableHead no encontrado');
        return;
    }
    if (!tableBody) {
        console.error('Elemento tableBody no encontrado');
        return;
    }
    
    // Mostrar información del archivo
    fileInfo.textContent = `${result.filename} - ${result.rows} filas`;
    
    // Crear encabezados de tabla
    const headerRow = document.createElement('tr');
    result.columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        headerRow.appendChild(th);
    });
    tableHead.innerHTML = '';
    tableHead.appendChild(headerRow);
    
    // Crear filas de datos (mostrar solo las primeras 10 filas)
    tableBody.innerHTML = '';
    const maxRows = Math.min(10, result.data.length);
    
    for (let i = 0; i < maxRows; i++) {
        const row = document.createElement('tr');
        result.columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = result.data[i][column] || '';
            row.appendChild(td);
        });
        tableBody.appendChild(row);
    }
    
    // Mostrar mensaje si hay más filas
    if (result.data.length > 10) {
        const moreRow = document.createElement('tr');
        const moreCell = document.createElement('td');
        moreCell.colSpan = result.columns.length;
        moreCell.textContent = `... y ${result.data.length - 10} filas más`;
        moreCell.style.textAlign = 'center';
        moreCell.style.fontStyle = 'italic';
        moreCell.style.color = '#666';
        moreRow.appendChild(moreCell);
        tableBody.appendChild(moreRow);
    }
    
    // Mostrar secciones
    previewSection.style.display = 'block';
}

// Generar IDs únicos
async function generateIds() {
    if (!currentFile) {
        showToast('No hay archivo cargado', 'error');
        return;
    }
    
    showLoading('Generando IDs únicos...');
    
    try {
        const formData = new FormData();
        formData.append('file', currentFile);
        
        const response = await fetch('/generate-ids', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            resultsData = result.data;
            showResults(result);
            hideLoading();
            showToast('IDs generados exitosamente', 'success');
            
            // Actualizar historial y luego bases de datos para medidas antropométricas
            await loadHistory(); // Esperar a que se cargue el historial
            
            // Esperar un poco más para asegurar que el DOM esté listo
            setTimeout(async () => {
                await loadAnthropometricDatabases(); // Luego cargar bases de datos
            }, 1000);
        } else {
            throw new Error(result.detail || 'Error al generar IDs');
        }
        
    } catch (error) {
        hideLoading();
        showToast(`Error: ${error.message}`, 'error');
        console.error('Error:', error);
    }
}

// Mostrar resultados
function showResults(result) {
    const previewSection = document.getElementById('previewSection');
    const resultsSection = document.getElementById('resultsSection');
    const idsCount = document.getElementById('idsCount');
    const resultsHead = document.getElementById('resultsHead');
    const resultsBody = document.getElementById('resultsBody');
    
    // Mostrar contador de IDs
    idsCount.textContent = result.rows;
    
    // Crear encabezados de tabla
    const headerRow = document.createElement('tr');
    Object.keys(result.data[0]).forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        if (column === 'ID_Unico') {
            th.style.backgroundColor = '#e8f5e8';
            th.style.color = '#2e7d32';
        }
        headerRow.appendChild(th);
    });
    resultsHead.innerHTML = '';
    resultsHead.appendChild(headerRow);
    
    // Crear filas de datos (mostrar solo las primeras 10 filas)
    resultsBody.innerHTML = '';
    const maxRows = Math.min(10, result.data.length);
    
    for (let i = 0; i < maxRows; i++) {
        const row = document.createElement('tr');
        Object.keys(result.data[i]).forEach(column => {
            const td = document.createElement('td');
            const value = result.data[i][column];
            
            if (column === 'ID_Unico') {
                td.textContent = value;
                td.style.backgroundColor = '#f0f8f0';
                td.style.fontFamily = 'monospace';
                td.style.fontSize = '0.8rem';
            } else {
                td.textContent = value || '';
            }
            
            row.appendChild(td);
        });
        resultsBody.appendChild(row);
    }
    
    // Mostrar mensaje si hay más filas
    if (result.data.length > 10) {
        const moreRow = document.createElement('tr');
        const moreCell = document.createElement('td');
        moreCell.colSpan = Object.keys(result.data[0]).length;
        moreCell.textContent = `... y ${result.data.length - 10} filas más`;
        moreCell.style.textAlign = 'center';
        moreCell.style.fontStyle = 'italic';
        moreCell.style.color = '#666';
        moreRow.appendChild(moreCell);
        resultsBody.appendChild(moreRow);
    }
    
    // Guardar URL de descarga
    window.downloadUrl = result.download_url;
    
    // Mostrar secciones
    previewSection.style.display = 'none';
    resultsSection.style.display = 'block';
}

// Descargar archivo
function downloadFile() {
    if (window.downloadUrl) {
        const link = document.createElement('a');
        link.href = window.downloadUrl;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Descarga iniciada', 'success');
    } else {
        showToast('No hay archivo para descargar', 'error');
    }
}

// Resetear aplicación
function resetApp() {
    currentFile = null;
    previewData = null;
    resultsData = null;
    window.downloadUrl = null;
    
    // Limpiar inputs
    document.getElementById('fileInput').value = '';
    
    // Ocultar todas las secciones excepto upload
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    
    // Limpiar tablas
    document.getElementById('tableHead').innerHTML = '';
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('resultsHead').innerHTML = '';
    document.getElementById('resultsBody').innerHTML = '';
}

// Mostrar loading
function showLoading(text = 'Procesando...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = text;
    overlay.style.display = 'flex';
}

// Ocultar loading
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = 'none';
}

// Mostrar toast
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn('showToast: sin #toastContainer', message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Auto-remove después de 5 segundos
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

// Limpiar archivos temporales al cerrar la página
window.addEventListener('beforeunload', function() {
    if (window.downloadUrl) {
        const filename = window.downloadUrl.split('/').pop();
        fetch(`/cleanup/${filename}`, { method: 'DELETE' })
            .catch(error => console.error('Error cleaning up:', error));
    }
});

// Funciones para manejar el historial
async function loadHistory() {
    try {
        const response = await fetch('/files');
        const result = await response.json();
        
        
        if (result.success) {
            displayHistory(result.files);
        } else {
            console.error('Error loading history:', result);
            showToast('Error al cargar el historial: ' + (result.error || 'Error desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error loading history:', error);
        showToast('Error de conexión al cargar historial', 'error');
    }
}


function displayHistory(files) {
    const emptyHistory = document.getElementById('emptyHistory');
    const filesList = document.getElementById('filesList');
    
    if (files.length === 0) {
        emptyHistory.style.display = 'block';
        filesList.style.display = 'none';
    } else {
        emptyHistory.style.display = 'none';
        filesList.style.display = 'block';
        
        filesList.innerHTML = files.map(file => `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">${file.original_filename}</div>
                    <div class="file-details">
                        <span><i class="fas fa-table"></i> ${file.rows} filas</span>
                        <span><i class="fas fa-columns"></i> ${file.columns.length} columnas</span>
                        <span><i class="fas fa-calendar"></i> ${formatDate(file.created_at)}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="action-btn btn-view" onclick="viewFile('${file.id}')" title="Ver datos">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn btn-download" onclick="downloadFileFromHistory('${file.id}')" title="Descargar Excel">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn btn-labels" onclick="generateLabelsFromFile('${file.id}')" title="Generar Rotulados PDF">
                        <i class="fas fa-tags"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="deleteFileFromHistory('${file.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function viewFile(fileId) {
    try {
        showLoading('Cargando datos...');
        
        const response = await fetch(`/files/${fileId}/preview`);
        
        if (!response.ok) {
            if (response.status === 404) {
                showToast('El archivo ya no existe. Actualizando historial...', 'error');
                // Recargar historial para limpiar archivos faltantes
                await loadHistory();
                return;
            }
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data && result.columns) {
            // Mostrar los datos en una nueva ventana o modal
            showFilePreview(result.data, result.columns, result.rows);
        } else {
            showToast('Error al cargar los datos: ' + (result.detail || 'Datos no disponibles'), 'error');
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error en viewFile:', error);
        showToast(`Error: ${error.message}`, 'error');
    }
}

function showFilePreview(data, columns, rows) {
    // Validar que los datos estén disponibles
    if (!data || !Array.isArray(data) || data.length === 0) {
        showToast('No hay datos disponibles para mostrar', 'error');
        return;
    }
    
    if (!columns || !Array.isArray(columns) || columns.length === 0) {
        showToast('No hay columnas disponibles para mostrar', 'error');
        return;
    }
    
    // Crear modal para mostrar los datos con ID único
    const modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-eye"></i> Vista Previa de Datos</h3>
                <button class="modal-close" onclick="closePreviewModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${col}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    ${columns.map(col => `<td>${row[col] || ''}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <p style="text-align: center; color: #666; margin-top: 10px;">Total: ${data.length} filas</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.remove();
    }
}

async function downloadFileFromHistory(fileId) {
    try {
        const response = await fetch(`/files/${fileId}`);
        const result = await response.json();
        
        if (result.success) {
            const link = document.createElement('a');
            link.href = `/download/${result.file.processed_filename}`;
            link.download = result.file.processed_filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Descarga iniciada', 'success');
        } else {
            showToast('Error al obtener información del archivo', 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function deleteFileFromHistory(fileId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
        return;
    }
    
    try {
        const response = await fetch(`/files/${fileId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Archivo eliminado', 'success');
            loadHistory(); // Recargar historial
        } else {
            showToast('Error al eliminar el archivo', 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function generateLabelsFromFile(fileId) {
    try {
        showLoading('Generando PDF con rotulados...');
        
        const response = await fetch(`/files/${fileId}/generate-labels`);
        
        if (!response.ok) {
            if (response.status === 404) {
                showToast('El archivo ya no existe. Actualizando historial...', 'error');
                await loadHistory();
                return;
            }
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Descargar el PDF automáticamente
            const link = document.createElement('a');
            link.href = result.download_url;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast(`${result.message}. PDF descargado.`, 'success');
        } else {
            showToast('Error al generar PDF: ' + (result.detail || 'Error desconocido'), 'error');
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error en generateLabelsFromFile:', error);
        showToast(`Error: ${error.message}`, 'error');
    }
}

// Funciones para medidas antropométricas
async function loadAnthropometricDatabases() {
    try {
        const response = await fetch('/files');
        const result = await response.json();
        
        
        if (result.success && result.files.length > 0) {
            displayAnthropometricDatabases(result.files);
        } else {
            showEmptyDatabases();
        }
    } catch (error) {
        console.error('Error loading databases for anthropometric:', error);
        showEmptyDatabases();
    }
}

function displayAnthropometricDatabases(files) {
    const databasesGrid = document.getElementById('databasesGrid');
    const emptyDatabases = document.getElementById('emptyDatabases');
    
    if (!databasesGrid) {
        console.error('Elemento databasesGrid no encontrado');
        return;
    }
    
    if (files.length === 0) {
        showEmptyDatabases();
        return;
    }
    
    // Ocultar mensaje vacío si existe
    if (emptyDatabases) {
        emptyDatabases.style.display = 'none';
    }
    databasesGrid.innerHTML = files.map(file => `
        <div class="database-item" onclick="selectDatabase('${file.id}')">
            <h5>${file.original_filename}</h5>
            <p><i class="fas fa-table"></i> ${file.rows} filas</p>
            <p><i class="fas fa-columns"></i> ${file.columns.length} columnas</p>
            <p><i class="fas fa-calendar"></i> ${formatDate(file.created_at)}</p>
            <button class="btn-select" onclick="event.stopPropagation(); selectDatabase('${file.id}')">
                <i class="fas fa-check"></i> Seleccionar
            </button>
        </div>
    `).join('');
}

function showEmptyDatabases() {
    const databasesGrid = document.getElementById('databasesGrid');
    const emptyDatabases = document.getElementById('emptyDatabases');
    
    if (!databasesGrid) {
        console.error('Elemento databasesGrid no encontrado en showEmptyDatabases');
        return;
    }
    
    databasesGrid.innerHTML = '';
    
    // Mostrar mensaje vacío si existe
    if (emptyDatabases) {
        emptyDatabases.style.display = 'block';
    }
}

async function selectDatabase(databaseId) {
    try {
        showLoading('Cargando base de datos...');
        
        const response = await fetch(`/files/${databaseId}/complete`);
        const result = await response.json();
        
        if (result.success) {
            selectedDatabase = { id: databaseId, data: result.data };
            allPatients = result.data.map(row => ({
                id: row.ID_Unico,
                data: row
            }));
            
            
            // Ocultar selector de base de datos y mostrar selector de paciente
            document.getElementById('databaseSelector').style.display = 'none';
            document.getElementById('patientSelector').style.display = 'block';
            
            // Cargar lista de pacientes
            displayPatients(allPatients);
            
            showToast(`Base de datos cargada: ${result.rows} pacientes`, 'success');
        } else {
            showToast('Error al cargar la base de datos: ' + (result.error || 'Error desconocido'), 'error');
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error selecting database:', error);
        showToast('Error al cargar la base de datos: ' + error.message, 'error');
    }
}

// Función para verificar si un paciente tiene medidas registradas
async function checkIfPatientHasMeasurements(patientId) {
    try {
        if (!selectedDatabase) {
            return false;
        }
        
        const response = await fetch(`/check-patient-measurements/${selectedDatabase.id}/${patientId}`);
        
        if (!response.ok) {
            return false;
        }
        
        const result = await response.json();
        
        return result.has_measurements;
    } catch (error) {
        console.error('Error verificando medidas:', error);
        return false;
    }
}

// Función para verificar si un paciente tiene perfil lipídico registrado
async function checkIfPatientHasLipidProfile(patientId) {
    try {
        if (!selectedLipidDatabase) {
            return false;
        }
        
        const response = await fetch(`/check-patient-lipid-profile/${selectedLipidDatabase.id}/${patientId}`);
        
        if (!response.ok) {
            return false;
        }
        
        const result = await response.json();
        
        return result.has_lipid_profile;
    } catch (error) {
        console.error('Error verificando perfil lipídico:', error);
        return false;
    }
}

// Función para mostrar modal de paciente ya procesado para perfil lipídico
function showLipidPatientAlreadyProcessedModal(patientId) {
    const modal = document.getElementById('confirmationModal');
    
    if (modal) {
        // Cambiar el contenido del modal para mostrar el mensaje de paciente ya procesado
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header" style="background: linear-gradient(135deg, #dc3545, #c82333);">
                    <h3><i class="fas fa-exclamation-triangle"></i> Paciente Ya Procesado</h3>
                    <button type="button" class="close-btn" onclick="closeConfirmationModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="success-icon" style="color: #dc3545;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <p class="success-message">Este paciente ya tiene perfil lipídico registrado</p>
                    <div class="details">
                        <div class="detail-item">
                            <i class="fas fa-user" style="color: #dc3545;"></i>
                            <span><strong>Paciente:</strong> ${patientId}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-database" style="color: #dc3545;"></i>
                            <span><strong>Base de datos:</strong> ${selectedLipidDatabase.id}</span>
                        </div>
                    </div>
                    <p class="info-message">Verifique y seleccione un nuevo paciente.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-danger" onclick="closeConfirmationModal()">
                        <i class="fas fa-check"></i> Entendido
                    </button>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
    }
}

// Función para editar medidas de un paciente
async function editPatientMeasurements(patientId) {
    
    // Verificar que tenemos una base de datos seleccionada
    if (!selectedDatabase) {
        console.error('No hay base de datos seleccionada');
        showToast('Error: No hay base de datos seleccionada', 'error');
        return;
    }
    
    try {
        // Mostrar loading
        showLoading('Cargando datos del paciente...');
        
        // Obtener datos básicos del paciente desde la lista local
        const patientFromList = allPatients.find(p => p.id === patientId);
        
        // Obtener datos actuales del paciente (medidas registradas)
        const response = await fetch(`/get-patient-measurements/${selectedDatabase.id}/${patientId}`);
        
        let patientData = {};
        
        if (response.ok) {
            const serverData = await response.json();
            
            if (serverData.success && serverData.data) {
                patientData = serverData.data;
            }
        } else {
        }
        
        // Combinar datos básicos del paciente con datos de medidas
        if (patientFromList) {
            // Usar datos básicos del paciente como base
            patientData = {
                ...patientFromList.data,
                ...patientData  // Las medidas registradas tienen prioridad
            };
            
            // Asegurar que tenemos el sexo del paciente original
            if (!patientData.Sexo_Medidas && patientFromList.data.Sexo) {
                patientData.Sexo_Medidas = patientFromList.data.Sexo;
            }
            
            // Asegurar que tenemos la fecha de nacimiento del paciente original
            if (!patientData.Fecha_Nacimiento && patientFromList.data.Fecha_Nacimiento) {
                patientData.Fecha_Nacimiento = patientFromList.data.Fecha_Nacimiento;
            }
        }
        
        
        // Verificar que tenemos los datos correctos
        if (!patientData) {
            console.error('No se pudieron obtener datos del paciente');
            hideLoading();
            showToast('Error: No se pudieron obtener datos del paciente', 'error');
            return;
        }
        
        // Ocultar loading
        hideLoading();
        
        // Misma interfaz que registro y que perfil lipídico: formulario principal en el acordeón
        selectedPatient = patientFromList || { id: patientId, data: patientData || {} };
        ensureAnthropometricSectionExpanded();
        document.getElementById('patientSelector').style.display = 'none';
        document.getElementById('anthropometricForm').style.display = 'block';
        window.anthropometricInlineEditMode = true;
        window.editingPatientId = patientId;
        setAnthropometricFormActionsMode('edit');
        displayPatientInfo(selectedPatient);
        fillAnthropometricMainFormFromPatientMeasureData(patientId, patientData);
        setTimeout(() => recalculateAnthropometricExpanderHeight(), 100);
        setTimeout(() => recalculateAnthropometricExpanderHeight(), 500);
        showToast('Datos cargados para edición', 'success');
        
    } catch (error) {
        console.error('Error obteniendo datos del paciente:', error);
        hideLoading();
        showToast('Error al cargar datos del paciente: ' + error.message, 'error');
    }
}

async function displayPatients(patients) {
    const patientList = document.getElementById('patientList');
    
    // Mostrar loading mientras verificamos
    patientList.innerHTML = '<div style="text-align: center; padding: 20px;">Cargando pacientes...</div>';
    
    // Crear elementos de pacientes de forma asíncrona
    const patientElements = [];
    
    for (const patient of patients) {
        try {
            // Verificar si el paciente tiene medidas registradas
            const hasMeasurements = await checkIfPatientHasMeasurements(patient.id);
            
            
            // Siempre mostrar el botón de editar, pero con diferente texto según si tiene medidas o no
            const editButtonText = hasMeasurements ? 'Editar medidas' : 'Agregar medidas';
            const editButtonIcon = hasMeasurements ? 'fas fa-edit' : 'fas fa-plus';
            
            const statusIcon = hasMeasurements ? 
                '<i class="fas fa-check-circle text-success"></i>' : 
                '<i class="fas fa-plus-circle text-primary"></i>';
            
            const statusText = hasMeasurements ? 
                'Medidas registradas' : 
                'Sin medidas';
            
            patientElements.push(`
                <div class="patient-item" data-patient-id="${patient.id}" onclick="selectPatient('${patient.id}')">
                    <div class="patient-info">
                        <h6><i class="fas fa-user"></i> Paciente ${patient.id}</h6>
                        <p>${statusIcon} ${statusText}</p>
                    </div>
                    <div class="patient-actions">
                        <button type="button" class="report-btn" ${hasMeasurements ? '' : 'disabled'} onclick="event.stopPropagation(); openAnthropometricParentReport('${patient.id}', ${hasMeasurements})" title="${hasMeasurements ? 'Reporte para padres/tutores' : 'Sin medidas para reporte'}">
                            <i class="fas fa-file-medical-alt"></i>
                        </button>
                        <button type="button" class="edit-btn" onclick="event.stopPropagation(); editPatientMeasurements('${patient.id}')" title="${editButtonText}">
                            <i class="${editButtonIcon}"></i>
                        </button>
                    </div>
                </div>
            `);
        } catch (error) {
            console.error(`Error verificando medidas para paciente ${patient.id}:`, error);
            // Si hay error, mostrar con botón de editar por defecto
            patientElements.push(`
                <div class="patient-item" data-patient-id="${patient.id}" onclick="selectPatient('${patient.id}')">
                    <div class="patient-info">
                        <h6><i class="fas fa-user"></i> Paciente ${patient.id}</h6>
                        <p><i class="fas fa-question-circle text-warning"></i> Estado desconocido</p>
                    </div>
                    <div class="patient-actions">
                        <button type="button" class="report-btn" disabled onclick="event.stopPropagation(); openAnthropometricParentReport('${patient.id}', false)" title="Sin medidas para reporte">
                            <i class="fas fa-file-medical-alt"></i>
                        </button>
                        <button type="button" class="edit-btn" onclick="event.stopPropagation(); editPatientMeasurements('${patient.id}')" title="Editar medidas">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </div>
            `);
        }
    }
    
    
    patientList.innerHTML = patientElements.join('');
}

async function filterPatients() {
    const searchTerm = document.getElementById('patientSearch').value.toLowerCase();
    const filteredPatients = allPatients.filter(patient => 
        patient.id.toLowerCase().includes(searchTerm)
    );
    
    await displayPatients(filteredPatients);
}

async function selectPatient(patientId) {
    
    selectedPatient = allPatients.find(p => p.id === patientId);
    
    if (selectedPatient) {
        // Verificar si el paciente ya tiene medidas antropométricas
        try {
            const response = await fetch(`/check-patient-measurements/${selectedDatabase.id}/${patientId}`);
            
            if (!response.ok) {
                proceedWithPatientSelection(patientId);
                return;
            }
            
            const result = await response.json();
            
            if (result.has_measurements) {
                // Mostrar mensaje de que ya fue procesado
                showPatientAlreadyProcessedModal(patientId);
                return;
            }
            
            // Si no tiene medidas, continuar normalmente
            proceedWithPatientSelection(patientId);
            
        } catch (error) {
            console.error('Error verificando medidas:', error);
            // En caso de error, permitir el procesamiento normal
            proceedWithPatientSelection(patientId);
        }
    }
}

function proceedWithPatientSelection(patientId) {
    
    window.anthropometricInlineEditMode = false;
    window.editingPatientId = null;
    setAnthropometricFormActionsMode('new');
    
    // Actualizar UI para mostrar paciente seleccionado
    document.querySelectorAll('.patient-item').forEach(item => {
        item.classList.remove('selected');
        // Marcar como seleccionado el item que corresponde al paciente
        if (item.getAttribute('data-patient-id') === patientId) {
            item.classList.add('selected');
        }
    });
    
    // Mostrar formulario de medidas antropométricas
    document.getElementById('patientSelector').style.display = 'none';
    document.getElementById('anthropometricForm').style.display = 'block';
    
    // Mostrar información del paciente
    displayPatientInfo(selectedPatient);
    
    // Llenar automáticamente edad y sexo desde la base de datos
    fillPatientDataFromDatabase(selectedPatient);
    
    // Recalcular el tamaño del expander después de mostrar el formulario
    setTimeout(() => {
        recalculateAnthropometricExpanderHeight();
    }, 100);
    
    showToast(`Paciente ${patientId} seleccionado`, 'success');
}

// Recalcular altura del expander de medidas antropométricas (evita recorte si crece el contenido dinámico)
function recalculateAnthropometricExpanderHeight() {
    const content = document.getElementById('anthropometricExpanderContent');
    if (!content || !content.classList.contains('expanded')) return;
    content.style.maxHeight = 'none';
}

function normalizeAnthroDateInputValue(value) {
    if (value === undefined || value === null || value === '' || value === 'NaT') return '';
    const s = String(value).trim();
    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
            const d = parts[0].padStart(2, '0');
            const m = parts[1].padStart(2, '0');
            let y = parts[2];
            if (y.length === 2) y = '20' + y;
            return `${y}-${m}-${d}`;
        }
    }
    return s.split('T')[0];
}

function normalizeAnthroSexForSelect(value) {
    if (!value || value === 'NaT') return '';
    const s = String(value).trim();
    if (s === 'M' || s === 'F') return s;
    const lower = s.toLowerCase();
    if (lower === 'm' || lower === 'masculino' || lower.includes('mascul')) return 'M';
    if (lower === 'f' || lower === 'femenino' || lower.includes('femen')) return 'F';
    return s;
}

function setAnthropometricFormActionsMode(mode) {
    const newBlock = document.getElementById('anthroFormActionsNew');
    const editBlock = document.getElementById('anthroFormActionsEdit');
    if (!newBlock || !editBlock) return;
    if (mode === 'edit') {
        newBlock.style.display = 'none';
        editBlock.style.display = '';
    } else {
        newBlock.style.display = '';
        editBlock.style.display = 'none';
    }
}

function ensureAnthropometricSectionExpanded() {
    const content = document.getElementById('anthropometricExpanderContent');
    const icon = document.getElementById('anthropometricExpanderIcon');
    if (!content || content.classList.contains('expanded')) return;
    content.classList.add('expanded');
    if (icon) icon.classList.add('expanded');
        content.style.maxHeight = content.scrollHeight + 'px';
    window.setTimeout(() => recalculateAnthropometricExpanderHeight(), 350);
}

function fillAnthropometricMainFormFromPatientMeasureData(patientId, patientData) {
    window.editingPatientId = patientId;
    const refEl = document.getElementById('anthropometricReferenceDate');
    const refNorm = normalizeAnthroDateInputValue(patientData.Fecha_Referencia_Medidas);
    if (refEl) {
        refEl.value = refNorm || refEl.value || getTodayLocalISO();
    }
    const birthEl = document.getElementById('birthdate');
    if (birthEl) {
        birthEl.value = normalizeAnthroDateInputValue(patientData.Fecha_Nacimiento);
    }
    const sexEl = document.getElementById('sex');
    if (sexEl) {
        sexEl.value = normalizeAnthroSexForSelect(patientData.Sexo_Medidas || patientData.Sexo || '');
    }
    const setNum = (id, v) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (v !== undefined && v !== null && v !== '' && v !== 'NaT') el.value = v;
        else el.value = '';
    };
    setNum('height', patientData.Estatura_cm);
    setNum('weight', patientData.Peso_kg);
    setNum('waist', patientData.Circunferencia_Cintura_cm);
    setNum('arm', patientData.Perimetro_Braquial_cm);
    setNum('head', patientData.Perimetro_Cefalico_cm);
    setNum('oxygenation', patientData.Oxigenacion_pct !== undefined && patientData.Oxigenacion_pct !== null ? patientData.Oxigenacion_pct : patientData.Oxigenacion);
    setNum('heartRate', patientData.Frecuencia_Cardiaca_lpm !== undefined && patientData.Frecuencia_Cardiaca_lpm !== null ? patientData.Frecuencia_Cardiaca_lpm : patientData.Frecuencia_Cardiaca);
    let resp = patientData.Frecuencia_Respiratoria_15s ?? patientData.Frecuencia_Respiratoria;
    const respMin = patientData.Frecuencia_Respiratoria_min ?? patientData.Frecuencia_Respiratoria_Min ?? patientData.FRECUENCIA_RESPIRATORIA_MIN;
    if (respMin !== undefined && respMin !== null && respMin !== '' && isFinite(Number(respMin))) {
        const numericValue = parseFloat(respMin);
        if (!isNaN(numericValue)) {
            resp = (numericValue / 4).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
        }
    }
    setNum('respiratoryRate', resp);
    setNum('temperature', patientData.Temperatura_C !== undefined && patientData.Temperatura_C !== null ? patientData.Temperatura_C : patientData.Temperatura);
    const birthdateInput = document.getElementById('birthdate');
    const ageDisplayInput = document.getElementById('ageDisplay');
    if (birthdateInput && birthdateInput.value && ageDisplayInput) {
        const ageInfo = calculateAgeInYearsAndMonths(birthdateInput.value, getAnthropometricReferenceDateValue());
        if (ageInfo) {
            ageDisplayInput.value = ageInfo.display;
            configureFieldsByAge(ageInfo.totalMonths);
        }
    }
    const heightInput = document.getElementById('height');
    const weightInput = document.getElementById('weight');
    const sexInput = document.getElementById('sex');
    if (heightInput && weightInput && birthdateInput && ageDisplayInput && sexInput) {
        if (birthdateInput.value) {
            const ai = calculateAgeInYearsAndMonths(birthdateInput.value, getAnthropometricReferenceDateValue());
            if (ai) ageDisplayInput.value = ai.display;
        }
        heightInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.setTimeout(() => {
        recalculateAnthropometricExpanderHeight();
        updateVitalsReferencePanel();
    }, 450);
}

window.cancelAnthropometricInlineEdit = function () {
    window.anthropometricInlineEditMode = false;
    window.editingPatientId = null;
    resetAnthropometricForm();
    const formEl = document.getElementById('anthropometricForm');
    const selectorEl = document.getElementById('patientSelector');
    if (formEl) formEl.style.display = 'none';
    if (selectorEl) selectorEl.style.display = 'block';
    selectedPatient = null;
    setAnthropometricFormActionsMode('new');
    setTimeout(() => recalculateAnthropometricExpanderHeight(), 100);
    displayPatients(allPatients);
    showToast('Edición cancelada', 'info');
};

window.submitAnthropometricInlineUpdate = async function () {
    const patientId = window.editingPatientId;
    if (!window.anthropometricInlineEditMode || !patientId) {
        showToast('No hay una edición activa', 'error');
        return;
    }
    if (!selectedDatabase) {
        showToast('No hay base de datos seleccionada', 'error');
        return;
    }
    const birthdate = document.getElementById('birthdate').value;
    const sex = document.getElementById('sex').value;
    const height = document.getElementById('height').value;
    const weight = document.getElementById('weight').value;
    if (!height || !weight) {
        showToast('Estatura y peso son obligatorios', 'error');
        return;
    }
    if (!birthdate || !sex) {
        showToast('Indica fecha de nacimiento y sexo', 'error');
        return;
    }
    const measurementFields = ['height', 'weight', 'waist', 'arm', 'head', 'oxygenation', 'heartRate', 'respiratoryRate', 'temperature'];
    let hasErrors = false;
    measurementFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field && field.value.trim() !== '') {
            if (!validateMeasurementField(fieldId)) hasErrors = true;
        }
    });
    if (hasErrors) {
        showToast('Corrige los errores en los campos de medidas', 'error');
        return;
    }
    const formData = new FormData();
    formData.append('patient_id', patientId);
    formData.append('database_id', selectedDatabase.id);
    formData.append('birthdate', birthdate);
    formData.append('ageDisplay', document.getElementById('ageDisplay').value);
    formData.append('sex', sex);
    formData.append('height', height);
    formData.append('weight', weight);
    const safeGetValue = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };
    formData.append('waist', safeGetValue('waist'));
    formData.append('arm', safeGetValue('arm'));
    formData.append('head', safeGetValue('head'));
    formData.append('bmi', safeGetValue('bmi'));
    formData.append('bmiPercentile', safeGetValue('bmiPercentile'));
    formData.append('heightPercentile', safeGetValue('heightPercentile'));
    formData.append('weightPercentile', safeGetValue('weightPercentile'));
    formData.append('armPercentile', safeGetValue('armPercentile'));
    formData.append('headPercentile', safeGetValue('headPercentile'));
    formData.append('oxygenation', safeGetValue('oxygenation'));
    formData.append('heartRate', safeGetValue('heartRate'));
    formData.append('respiratoryRate', safeGetValue('respiratoryRate'));
    formData.append('temperature', safeGetValue('temperature'));
    formData.append('anthropometricReferenceDate', safeGetValue('anthropometricReferenceDate'));
    try {
        const response = await fetch('/update-anthropometric-data', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            showConfirmationModal(
                patientId,
                selectedDatabase.id,
                'Medidas actualizadas',
                'Las medidas antropométricas se actualizaron correctamente.',
                { afterClose: 'anthropometric-patients' }
            );
            showToast('Medidas antropométricas actualizadas', 'success');
        } else {
            showToast('Error al actualizar: ' + (result.message || 'desconocido'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Error al actualizar las medidas', 'error');
    }
};

function showPatientAlreadyProcessedModal(patientId) {
    const modal = document.getElementById('confirmationModal');
    
    if (modal) {
        // Cambiar el contenido del modal para mostrar el mensaje de paciente ya procesado
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header" style="background: linear-gradient(135deg, #dc3545, #c82333);">
                    <h3><i class="fas fa-exclamation-triangle"></i> Paciente Ya Procesado</h3>
                    <button type="button" class="close-btn" onclick="closeConfirmationModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="success-icon" style="color: #dc3545;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <p class="success-message">Este paciente ya fue procesado</p>
                    <div class="details">
                        <div class="detail-item">
                            <i class="fas fa-user" style="color: #dc3545;"></i>
                            <span><strong>Paciente:</strong> ${patientId}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-database" style="color: #dc3545;"></i>
                            <span><strong>Base de datos:</strong> ${selectedDatabase.id}</span>
                        </div>
                    </div>
                    <p class="info-message">Verifique y seleccione un nuevo paciente.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-danger" onclick="closeConfirmationModal()">
                        <i class="fas fa-check"></i> Entendido
                    </button>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
    }
}

function displayPatientInfo(patient) {
    const patientInfo = document.getElementById('patientInfo');
    
    patientInfo.innerHTML = `
        <h5><i class="fas fa-user"></i> Paciente Seleccionado</h5>
        <p><strong>ID:</strong> ${patient.id}</p>
        <p><strong>Base de datos:</strong> ${selectedDatabase.data[0] ? Object.keys(selectedDatabase.data[0]).length : 0} campos disponibles</p>
    `;
}

function fillPatientDataFromDatabase(patient) {
    // Buscar los datos del paciente en la base de datos seleccionada
    const patientData = selectedDatabase.data.find(row => row.ID_Unico === patient.id);
    
    
    if (patientData) {
        // Llenar fecha de nacimiento - buscar diferentes variaciones de nombres
        const birthdateValue = patientData.fecha_nacimiento || patientData.Fecha_Nacimiento || patientData.FECHA_NACIMIENTO ||
                              patientData.birthdate || patientData.Birthdate || patientData.BIRTHDATE ||
                              patientData.fecha_nac || patientData.Fecha_Nac || patientData.FECHA_NAC;
        
        
        if (birthdateValue && birthdateValue !== '' && birthdateValue !== 'NaT' && birthdateValue.trim() !== '') {
            // Si es una fecha en formato string, convertirla
            let dateValue = birthdateValue;
            if (typeof dateValue === 'string' && dateValue.includes('/')) {
                // Convertir formato DD/MM/YYYY a YYYY-MM-DD
                const parts = dateValue.split('/');
                if (parts.length === 3) {
                    dateValue = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
            
            document.getElementById('birthdate').value = dateValue;
            
            // Calcular y mostrar la edad
            const ageInfo = calculateAgeInYearsAndMonths(dateValue, getAnthropometricReferenceDateValue());
            if (ageInfo) {
                document.getElementById('ageDisplay').value = ageInfo.display;
            }
        } else {
            
            // Si el campo está vacío, dejar el campo para que el usuario ingrese la fecha
            const birthdateField = document.getElementById('birthdate');
            if (birthdateField) {
                birthdateField.value = '';
            }
        }
        
        // Llenar sexo - buscar diferentes variaciones de nombres
        const sexValue = patientData.sexo || patientData.Sexo || patientData.SEXO ||
                        patientData.genero || patientData.Genero || patientData.GENERO ||
                        patientData.gender || patientData.Gender || patientData.GENDER;
        
        
        if (sexValue && sexValue !== '' && sexValue !== 'NaT' && sexValue.trim() !== '') {
            const sexField = document.getElementById('sex');
            if (sexField) {
                sexField.value = sexValue;
            } else {
            }
        } else {
            
            // Si el campo está vacío, dejar el dropdown para que el usuario seleccione
            const sexField = document.getElementById('sex');
            if (sexField) {
                sexField.value = '';
            }
        }
        
        // Llenar estatura - buscar diferentes variaciones
        const heightValue = patientData.estatura || patientData.Estatura || patientData.ESTATURA ||
                           patientData.talla || patientData.Talla || patientData.TALLA ||
                           patientData.height || patientData.Height || patientData.HEIGHT;
        
        if (heightValue !== undefined && heightValue !== null && heightValue !== '') {
            document.getElementById('height').value = heightValue;
        }
        
        // Llenar peso - buscar diferentes variaciones
        const weightValue = patientData.peso || patientData.Peso || patientData.PESO ||
                           patientData.weight || patientData.Weight || patientData.WEIGHT;
        
        if (weightValue !== undefined && weightValue !== null && weightValue !== '') {
            document.getElementById('weight').value = weightValue;
        }
        
        // Llenar otras medidas si existen
        const waistValue = patientData.cintura || patientData.Cintura || patientData.CINTURA ||
                          patientData.waist || patientData.Waist || patientData.WAIST;
        
        if (waistValue !== undefined && waistValue !== null && waistValue !== '') {
            document.getElementById('waist').value = waistValue;
        }
        
        const hipValue = patientData.cadera || patientData.Cadera || patientData.CADERA ||
                        patientData.hip || patientData.Hip || patientData.HIP;
        
        if (hipValue !== undefined && hipValue !== null && hipValue !== '') {
            document.getElementById('hip').value = hipValue;
        }
        
        const neckValue = patientData.cuello || patientData.Cuello || patientData.CUELLO ||
                         patientData.neck || patientData.Neck || patientData.NECK;
        
        if (neckValue !== undefined && neckValue !== null && neckValue !== '') {
            document.getElementById('neck').value = neckValue;
        }
        
        const armValue = patientData.brazo || patientData.Brazo || patientData.BRAZO ||
                        patientData.arm || patientData.Arm || patientData.ARM;
        
        if (armValue !== undefined && armValue !== null && armValue !== '') {
            document.getElementById('arm').value = armValue;
        }
        
        const oxygenationValue = patientData.Oxigenacion_pct || patientData.Oxigenacion || patientData.OXIGENACION;
        if (oxygenationValue !== undefined && oxygenationValue !== null && oxygenationValue !== '') {
            const oxygenationField = document.getElementById('oxygenation');
            if (oxygenationField) {
                oxygenationField.value = oxygenationValue;
            }
        }
        
        const heartRateValue = patientData.Frecuencia_Cardiaca_lpm || patientData.Frecuencia_Cardiaca || patientData.FRECUENCIA_CARDIACA;
        if (heartRateValue !== undefined && heartRateValue !== null && heartRateValue !== '') {
            const heartRateField = document.getElementById('heartRate');
            if (heartRateField) {
                heartRateField.value = heartRateValue;
            }
        }
        
        let respiratoryRateValue = patientData.Frecuencia_Respiratoria_15s || patientData.Frecuencia_Respiratoria || patientData.FRECUENCIA_RESPIRATORIA;
        const respiratoryRatePerMinute = patientData.Frecuencia_Respiratoria_min || patientData.Frecuencia_Respiratoria_Min || patientData.FRECUENCIA_RESPIRATORIA_MIN;
        if ((respiratoryRatePerMinute !== undefined && respiratoryRatePerMinute !== null && respiratoryRatePerMinute !== '') && isFinite(respiratoryRatePerMinute)) {
            const numericValue = parseFloat(respiratoryRatePerMinute);
            if (!isNaN(numericValue)) {
                respiratoryRateValue = (numericValue / 4).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
            }
        }
        if (respiratoryRateValue !== undefined && respiratoryRateValue !== null && respiratoryRateValue !== '') {
            const respiratoryRateField = document.getElementById('respiratoryRate');
            if (respiratoryRateField) {
                respiratoryRateField.value = respiratoryRateValue;
            }
        }
        
        const temperatureValue = patientData.Temperatura_C || patientData.Temperatura || patientData.TEMPERATURA;
        if (temperatureValue !== undefined && temperatureValue !== null && temperatureValue !== '') {
            const temperatureField = document.getElementById('temperature');
            if (temperatureField) {
                temperatureField.value = temperatureValue;
            }
        }
        
        // Recalcular IMC y percentil con los datos cargados
        const heightInput = document.getElementById('height');
        const weightInput = document.getElementById('weight');
        const birthdateInput = document.getElementById('birthdate');
        const ageDisplayInput = document.getElementById('ageDisplay');
        const sexInput = document.getElementById('sex');

        if (heightInput && weightInput && birthdateInput && ageDisplayInput && sexInput) {
            // Disparar el evento de cálculo automático
            
            // Si hay fecha de nacimiento, calcular edad primero
            if (birthdateInput.value) {
                const ageInfo = calculateAgeInYearsAndMonths(birthdateInput.value, getAnthropometricReferenceDateValue());
                if (ageInfo) {
                    ageDisplayInput.value = ageInfo.display;
                }
            }
            
            // Disparar evento de cálculo
            const event = new Event('input', { bubbles: true });
            heightInput.dispatchEvent(event);
        } else {
        }
        
        showToast('Datos del paciente cargados desde la base de datos', 'success');
    } else {
        showToast('Paciente seleccionado, complete los datos manualmente', 'info');
    }
}

// Fecha local de hoy en formato YYYY-MM-DD (evita desfases por zona horaria)
function getTodayLocalISO() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function parseYMDParts(dateStr) {
    if (!dateStr) return null;
    const part = String(dateStr).trim().split('T')[0];
    const m = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, m: mo, d };
}

function getAnthropometricReferenceDateValue() {
    const el = document.getElementById('anthropometricReferenceDate');
    if (el && el.value && el.value.trim() !== '') return el.value.trim();
    return getTodayLocalISO();
}

function getEditAnthropometricReferenceDateValue() {
    const el = document.getElementById('editAnthropometricReferenceDate');
    if (el && el.value && el.value.trim() !== '') return el.value.trim();
    return getTodayLocalISO();
}

// Función para calcular edad en años y meses desde fecha de nacimiento hasta referenceDate (o hoy si no se indica)
function calculateAgeInYearsAndMonths(birthDate, referenceDate) {
    if (!birthDate) {
        return null;
    }
    
    const refStr = referenceDate && String(referenceDate).trim() !== ''
        ? String(referenceDate).trim().split('T')[0]
        : getTodayLocalISO();
    
    
    const birth = parseYMDParts(birthDate);
    const ref = parseYMDParts(refStr);
    if (!birth || !ref) {
        return null;
    }
    
    const birthKey = birth.y * 10000 + birth.m * 100 + birth.d;
    const refKey = ref.y * 10000 + ref.m * 100 + ref.d;
    if (refKey < birthKey) {
        return null;
    }
    
    let years = ref.y - birth.y;
    let months = ref.m - birth.m;
    if (ref.d < birth.d) {
        months--;
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    
    const result = {
        years: years,
        months: months,
        totalMonths: years * 12 + months,
        display: `${years} años y ${months} meses`
    };
    
    return result;
}

// Función para validar que un valor sea un número positivo
function validatePositiveNumber(value) {
    if (value === '' || value === null || value === undefined) {
        return true; // Campo vacío es válido
    }
    
    // Verificar que no empiece con punto
    if (value.startsWith('.')) {
        return false;
    }
    
    // Verificar que no tenga múltiples puntos
    if ((value.match(/\./g) || []).length > 1) {
        return false;
    }
    
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0;
}

// Función para mostrar/ocultar mensaje de error
function toggleErrorMessage(fieldId, isValid) {
    const errorElement = document.getElementById(fieldId + 'Error');
    if (errorElement) {
        if (isValid) {
            errorElement.classList.remove('show');
        } else {
            errorElement.classList.add('show');
        }
    }
}

// Función para validar campo de medida antropométrica en el modal de edición
function validateEditMeasurementField(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    const value = field.value.trim();
    const isValid = validatePositiveNumber(value);
    
    // Cambiar estilo del campo
    if (isValid) {
        field.style.borderColor = '';
        field.style.backgroundColor = '';
    } else {
        field.style.borderColor = '#dc3545';
        field.style.backgroundColor = '#fff5f5';
    }
    
    return isValid;
}

// Función para validar campo de medida antropométrica
function validateMeasurementField(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    const value = field.value.trim();
    const isValid = validatePositiveNumber(value);
    
    // Mostrar/ocultar mensaje de error
    toggleErrorMessage(fieldId, isValid);
    
    // Cambiar estilo del campo
    if (isValid) {
        field.style.borderColor = '';
        field.style.backgroundColor = '';
    } else {
        field.style.borderColor = '#dc3545';
        field.style.backgroundColor = '#fff5f5';
    }
    
    return isValid;
}

function resetAnthropometricForm() {
    const form = document.getElementById('measurementsForm');
    if (form) {
        form.reset();
    }
    
    // Limpiar campos calculados
    const fieldsToClear = [
        'ageDisplay', 'bmi', 'bmiPercentile', 'heightPercentile', 
        'weightPercentile', 'armPercentile', 'headPercentile', 'waistHipRatio'
    ];
    
    fieldsToClear.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = '';
        }
    });
    
    // Limpiar mensajes de error y estilos
    const measurementFields = ['height', 'weight', 'waist', 'arm', 'head', 'oxygenation', 'heartRate', 'respiratoryRate', 'temperature'];
    measurementFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.style.borderColor = '';
            field.style.backgroundColor = '';
        }
        toggleErrorMessage(fieldId, true);
    });
    
    updateVitalsReferencePanel();
    showToast('Formulario limpiado', 'success');
}

/** Restaura el markup del modal si otro flujo (p. ej. "paciente ya procesado") reemplazó innerHTML */
const DEFAULT_CONFIRMATION_MODAL_INNER_HTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-check-circle"></i> <span id="modalTitle">Medidas Guardadas</span></h3>
                <button type="button" class="close-btn" onclick="closeConfirmationModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <p class="success-message" id="modalMessage">Medidas antropométricas guardadas correctamente</p>
                <div class="details">
                    <div class="detail-item">
                        <i class="fas fa-user"></i>
                        <span><strong>Paciente:</strong> <span id="modalPatientId"></span></span>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-database"></i>
                        <span><strong>Base de datos:</strong> <span id="modalDatabaseId"></span></span>
                    </div>
                </div>
                <p class="info-message">Los datos han sido añadidos como nuevas columnas en la base de datos.</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-success" onclick="closeConfirmationModal()">
                    <i class="fas fa-check"></i> Entendido
                </button>
            </div>
        </div>`;

function restoreDefaultConfirmationModalContent() {
    const modal = document.getElementById('confirmationModal');
    if (modal) {
        modal.innerHTML = DEFAULT_CONFIRMATION_MODAL_INNER_HTML.trim();
    }
}

function returnToAnthropometricPatientListAfterSave() {
    window.anthropometricInlineEditMode = false;
    window.editingPatientId = null;
    setAnthropometricFormActionsMode('new');
    resetAnthropometricForm();
    const formEl = document.getElementById('anthropometricForm');
    const selectorEl = document.getElementById('patientSelector');
    if (formEl) {
        formEl.style.display = 'none';
    }
    if (selectorEl) {
        selectorEl.style.display = 'block';
    }
    selectedPatient = null;
    setTimeout(() => {
        recalculateAnthropometricExpanderHeight();
    }, 100);
    displayPatients(allPatients);
}

function returnToLipidPatientListAfterSave() {
    resetLipidProfileForm();
    const formEl = document.getElementById('lipidProfileForm');
    const selectorEl = document.getElementById('lipidPatientSelector');
    if (formEl) {
        formEl.style.display = 'none';
    }
    if (selectorEl) {
        selectorEl.style.display = 'block';
    }
    selectedLipidPatient = null;
    setTimeout(() => {
        recalculateLipidExpanderHeight();
    }, 100);
    displayLipidPatients(allLipidPatients);
}

window.showConfirmationModal = function(patientId, databaseId, title, message, options) {
    const resolvedTitle = title !== undefined && title !== null ? title : 'Medidas Guardadas';
    const resolvedMessage = message !== undefined && message !== null ? message : 'Medidas antropométricas guardadas correctamente';
    confirmationModalAfterCloseAction = options && options.afterClose ? options.afterClose : null;

    const modal = document.getElementById('confirmationModal');
    if (!modal) {
        return;
    }

    let patientIdSpan = document.getElementById('modalPatientId');
    let databaseIdSpan = document.getElementById('modalDatabaseId');
    let titleSpan = document.getElementById('modalTitle');
    let messageSpan = document.getElementById('modalMessage');

    if (!patientIdSpan || !databaseIdSpan || !titleSpan || !messageSpan) {
        restoreDefaultConfirmationModalContent();
        patientIdSpan = document.getElementById('modalPatientId');
        databaseIdSpan = document.getElementById('modalDatabaseId');
        titleSpan = document.getElementById('modalTitle');
        messageSpan = document.getElementById('modalMessage');
    }

    if (patientIdSpan && databaseIdSpan && titleSpan && messageSpan) {
        patientIdSpan.textContent = patientId;
        databaseIdSpan.textContent = databaseId;
        titleSpan.textContent = resolvedTitle;
        messageSpan.textContent = resolvedMessage;
        modal.style.display = 'flex';
    }
};

window.closeConfirmationModal = function() {
    const modal = document.getElementById('confirmationModal');
    if (modal) {
        modal.style.display = 'none';
    }

    const action = confirmationModalAfterCloseAction;
    confirmationModalAfterCloseAction = null;

    if (action === 'anthropometric-patients') {
        returnToAnthropometricPatientListAfterSave();
    } else if (action === 'lipid-patients') {
        returnToLipidPatientListAfterSave();
    } else {
        if (document.getElementById('lipidPatientSelector') && document.getElementById('lipidPatientSelector').style.display !== 'none') {
            if (typeof displayLipidPatients === 'function') {
                displayLipidPatients(allLipidPatients);
            }
        }
        if (document.getElementById('patientSelector') && document.getElementById('patientSelector').style.display !== 'none') {
            if (typeof displayPatients === 'function') {
                displayPatients(allPatients);
            }
        }
    }
};

async function saveAnthropometricData() {
    
    // Validar datos requeridos
    const birthdate = document.getElementById('birthdate').value;
    const sex = document.getElementById('sex').value;
    const height = document.getElementById('height').value;
    const weight = document.getElementById('weight').value;
    
    
    // Validar que se haya seleccionado un paciente y base de datos
    if (!selectedPatient) {
        showToast('Por favor, selecciona un paciente primero', 'error');
        return;
    }
    
    if (!selectedDatabase) {
        showToast('Por favor, selecciona una base de datos primero', 'error');
        return;
    }
    
    if (!birthdate || !sex || !height || !weight) {
        showToast('Por favor, ingresa fecha de nacimiento, sexo, estatura y peso', 'error');
        return;
    }
    
    // Validar que todos los campos de medidas sean números positivos
    const measurementFields = ['height', 'weight', 'waist', 'arm', 'head', 'oxygenation', 'heartRate', 'respiratoryRate', 'temperature'];
    let hasErrors = false;
    
    measurementFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field && field.value.trim() !== '') {
            if (!validateMeasurementField(fieldId)) {
                hasErrors = true;
            }
        }
    });
    
    if (hasErrors) {
        showToast('Por favor corrige los errores en los campos de medidas', 'error');
        return;
    }
    
    // Preparar datos para enviar
    const formData = new FormData();
    formData.append('patient_id', selectedPatient.id);
    formData.append('database_id', selectedDatabase.id);
    formData.append('birthdate', birthdate);
    formData.append('ageDisplay', document.getElementById('ageDisplay').value);
    formData.append('sex', sex);
    formData.append('height', height);
    formData.append('weight', weight);
    
    // Campos que pueden no existir - verificar antes de acceder
    const safeGetValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value : '';
    };
    
    formData.append('bmi', safeGetValue('bmi'));
    formData.append('bmiPercentile', safeGetValue('bmiPercentile'));
    formData.append('heightPercentile', safeGetValue('heightPercentile'));
    formData.append('weightPercentile', safeGetValue('weightPercentile'));
    formData.append('waist', safeGetValue('waist'));
    formData.append('arm', safeGetValue('arm'));
    formData.append('armPercentile', safeGetValue('armPercentile'));
    formData.append('head', safeGetValue('head'));
    formData.append('headPercentile', safeGetValue('headPercentile'));
    formData.append('waistHipRatio', safeGetValue('waistHipRatio'));
    formData.append('oxygenation', safeGetValue('oxygenation'));
    formData.append('heartRate', safeGetValue('heartRate'));
    formData.append('respiratoryRate', safeGetValue('respiratoryRate'));
    formData.append('temperature', safeGetValue('temperature'));
    formData.append('anthropometricReferenceDate', safeGetValue('anthropometricReferenceDate'));
    
    try {
        const response = await fetch('/save-anthropometric-data', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Actualizar el estado del paciente en la lista para mostrar el icono de editar
            const patientIndex = allPatients.findIndex(p => p.id === selectedPatient.id);
            if (patientIndex !== -1) {
                allPatients[patientIndex].has_anthropometric_data = true;
            }
            
            // Mostrar modal de confirmación (al aceptar se vuelve a la lista de pacientes)
            showConfirmationModal(selectedPatient.id, selectedDatabase.id, undefined, undefined, { afterClose: 'anthropometric-patients' });
            
            // Mostrar toast adicional
            showToast('Medidas antropométricas guardadas correctamente en la base de datos', 'success');
            
            // Mostrar botón de descarga automáticamente
            showDownloadButton();
        } else {
            showToast('Error al guardar: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error guardando medidas:', error);
        showToast('Error al guardar las medidas', 'error');
    }
    
}

function selectAnotherPatient() {
    window.anthropometricInlineEditMode = false;
    window.editingPatientId = null;
    setAnthropometricFormActionsMode('new');
    // Limpiar formulario
    resetAnthropometricForm();
    
    // Ocultar formulario de medidas antropométricas
    document.getElementById('anthropometricForm').style.display = 'none';
    
    // Mostrar selector de pacientes
    document.getElementById('patientSelector').style.display = 'block';
    
    // Limpiar información del paciente seleccionado
    selectedPatient = null;
    
    // Recalcular el tamaño del expander después de volver al selector
    setTimeout(() => {
        recalculateAnthropometricExpanderHeight();
    }, 100);
    
    // Mostrar mensaje
    showToast('Selecciona otro paciente de la lista', 'info');
}

function changeDatabase() {
    window.anthropometricInlineEditMode = false;
    window.editingPatientId = null;
    setAnthropometricFormActionsMode('new');
    // Limpiar formulario
    resetAnthropometricForm();
    
    // Ocultar formulario de medidas antropométricas
    document.getElementById('anthropometricForm').style.display = 'none';
    
    // Ocultar selector de pacientes
    document.getElementById('patientSelector').style.display = 'none';
    
    // Mostrar selector de base de datos
    document.getElementById('databaseSelector').style.display = 'block';
    
    // Limpiar información seleccionada
    selectedPatient = null;
    selectedDatabase = null;
    allPatients = [];
    
    // Recalcular el tamaño del expander después de volver al selector de base de datos
    setTimeout(() => {
        recalculateAnthropometricExpanderHeight();
    }, 100);
    
    // Mostrar mensaje
    showToast('Selecciona otra base de datos', 'info');
}

// Función para determinar el rango de edad y configurar campos según corresponda
function configureFieldsByAge(ageInMonths) {
    const isChild5to19 = ageInMonths >= 61 && ageInMonths <= 228;
    const isChildOver10 = ageInMonths >= 121; // Mayor de 10 años
    
    // Definir placeholders originales para cada campo
    const originalPlaceholders = {
        'waist': 'Ej: 45.2',
        'arm': 'Ej: 12.8',
        'head': 'Ej: 48.5',
        'editWaist': 'Ej: 45.2',
        'editArm': 'Ej: 12.8',
        'editHead': 'Ej: 48.5'
    };
    
    // Campos de medidas antropométricas: SIEMPRE habilitados para permitir el registro de datos
    // en todas las edades (incluidos niños de 5-19 años). Se conservan los valores ingresados.
    const measurementInputFields = ['waist', 'arm', 'head', 'editWaist', 'editArm', 'editHead'];
    measurementInputFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.disabled = false;
            field.style.backgroundColor = '';
            field.style.color = '';
            if (originalPlaceholders[fieldId]) {
                field.placeholder = originalPlaceholders[fieldId];
            }
        }
    });
    
    // Campos de resultados de percentiles de perímetros: habilitados para que se calculen y
    // muestren cuando exista tabla OMS para la edad. Se limpia el texto antiguo de "No aplica".
    const perimeterResultFields = ['armPercentile', 'headPercentile', 'editArmPercentile', 'editHeadPercentile'];
    perimeterResultFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.disabled = false;
            field.style.backgroundColor = '';
            field.style.color = '';
            if (field.value && field.value.indexOf('No aplica') !== -1) {
                field.value = '';
            }
        }
    });
    
    // Desactivar percentil de peso para niños mayores de 10 años (solo se calcula IMC)
    const weightPercentileFields = ['weightPercentile'];
    const editWeightPercentileFields = ['editWeightPercentile'];
    
    weightPercentileFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.disabled = isChildOver10;
            field.style.backgroundColor = isChildOver10 ? '#f8f9fa' : '';
            field.style.color = isChildOver10 ? '#6c757d' : '';
            if (isChildOver10) {
                field.value = 'No aplica para niños mayores de 10 años';
            }
        }
    });
    
    editWeightPercentileFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.disabled = isChildOver10;
            field.style.backgroundColor = isChildOver10 ? '#f8f9fa' : '';
            field.style.color = isChildOver10 ? '#6c757d' : '';
            if (isChildOver10) {
                field.value = 'No aplica para niños mayores de 10 años';
            }
        }
    });
    
    // Mostrar mensaje informativo
    let ageRangeMessage;
    if (ageInMonths <= 60) {
        ageRangeMessage = 'Niño de 0-5 años: Se calculan todas las medidas antropométricas';
    } else if (ageInMonths <= 120) {
        ageRangeMessage = 'Niño de 5-10 años: Se calculan peso, estatura, IMC y percentil de peso';
    } else {
        ageRangeMessage = 'Niño de 10-19 años: Solo se calculan peso, estatura e IMC';
    }
    
    
    return {
        isChild5to19: isChild5to19,
        isChildOver10: isChildOver10,
        ageRange: ageInMonths <= 60 ? '0-5 años' : ageInMonths <= 120 ? '5-10 años' : '10-19 años',
        message: ageRangeMessage
    };
}
async function calculateBMIPercentile(bmi, ageInMonths, sex) {
    
    try {
        // Determinar qué endpoint usar según la edad
        let endpoint;
        let ageRange;
        
        if (ageInMonths <= 60) {
            // 0-5 años: usar tablas originales
            endpoint = `/oms-tables/bmi-percentiles?age_months=${ageInMonths}&sex=${sex}`;
            ageRange = "0-5 años";
        } else if (ageInMonths >= 61 && ageInMonths <= 228) {
            // 5-19 años: usar nuevas tablas
            endpoint = `/oms-tables/bmi-percentiles-5-19?age_months=${ageInMonths}&sex=${sex}`;
            ageRange = "5-19 años";
        } else {
            forgetAnthroOmsSlice('bmi');
            return 'Edad fuera del rango válido (0-19 años)';
        }
        
        
        // Consultar datos oficiales desde el backend
        const response = await fetch(endpoint);
        
        
        if (!response.ok) {
            console.error(`Error consultando tablas OMS de IMC (${ageRange}):`, response.statusText);
            forgetAnthroOmsSlice('bmi');
            return 'Error consultando datos OMS';
        }
        
        const data = await response.json();
        
        if (!data.success) {
            console.error(`Error en respuesta del servidor:`, data.error);
            forgetAnthroOmsSlice('bmi');
            return data.error || 'Error en datos OMS';
        }
        
        const percentiles = data.percentiles;
        rememberAnthroOmsSlice('bmi', bmi, percentiles, { ageMonths: ageInMonths, sex, table: `IMC OMS ${ageRange}` });
        
        
        // Lógica correcta para clasificar percentiles según OMS con rangos específicos
        if (bmi < percentiles.P15) {
            return 'P<15 (Bajo peso)';
        } else if (bmi <= percentiles.P25) {
            return 'P15-P25 (Peso normal)';
        } else if (bmi <= percentiles.P50) {
            return 'P25-P50 (Peso normal)';
        } else if (bmi <= percentiles.P75) {
            return 'P50-P75 (Peso normal)';
        } else if (bmi <= percentiles.P85) {
            return 'P75-P85 (Peso normal)';
        } else if (bmi <= percentiles.P95) {
            return 'P85-P95 (Sobrepeso)';
        } else if (bmi <= percentiles.P97) {
            return 'P95-P97 (Obesidad)';
        } else {
            return 'P>97 (Obesidad severa)';
        }
        
    } catch (error) {
        console.error('Error calculando percentil de IMC:', error);
        forgetAnthroOmsSlice('bmi');
        return 'Error en cálculo';
    }
}

// Función para calcular percentiles de talla según edad y sexo (OMS)
async function calculateHeightPercentile(height, ageInMonths, sex) {
    
    try {
        // Determinar qué endpoint usar según la edad
        let endpoint;
        let ageRange;
        
        if (ageInMonths <= 60) {
            // 0-5 años: usar tablas originales
            endpoint = `/oms-tables/height-percentiles?age_months=${ageInMonths}&sex=${sex}`;
            ageRange = "0-5 años";
        } else if (ageInMonths >= 61 && ageInMonths <= 228) {
            // 5-19 años: usar nuevas tablas
            endpoint = `/oms-tables/height-percentiles-5-19?age_months=${ageInMonths}&sex=${sex}`;
            ageRange = "5-19 años";
        } else {
            forgetAnthroOmsSlice('height');
            return 'Edad fuera del rango válido (0-19 años)';
        }
        
        
        // Consultar datos oficiales desde el backend
        const response = await fetch(endpoint);
        
        
        if (!response.ok) {
            console.error(`Error consultando tablas OMS de talla (${ageRange}):`, response.statusText);
            forgetAnthroOmsSlice('height');
            return 'Error consultando datos OMS';
        }
        
        const data = await response.json();
        
        if (!data.success) {
            console.error(`Error en respuesta del servidor:`, data.error);
            forgetAnthroOmsSlice('height');
            return data.error || 'Error en datos OMS';
        }
        
        const percentiles = data.percentiles;
        rememberAnthroOmsSlice('height', height, percentiles, { ageMonths: ageInMonths, sex, table: `Talla OMS ${ageRange}` });
        
        
        // Lógica correcta para clasificar percentiles de talla según OMS con rangos específicos
        if (height < percentiles.P15) {
            return 'P<15 (Baja talla)';
        } else if (height <= percentiles.P25) {
            return 'P15-P25 (Talla normal)';
        } else if (height <= percentiles.P50) {
            return 'P25-P50 (Talla normal)';
        } else if (height <= percentiles.P75) {
            return 'P50-P75 (Talla normal)';
        } else if (height <= percentiles.P85) {
            return 'P75-P85 (Talla normal)';
        } else if (height <= percentiles.P95) {
            return 'P85-P95 (Talla alta)';
        } else if (height <= percentiles.P97) {
            return 'P95-P97 (Talla muy alta)';
        } else {
            return 'P>97 (Talla excepcional)';
        }
        
    } catch (error) {
        console.error('Error calculando percentil de talla:', error);
        forgetAnthroOmsSlice('height');
        return 'Error en cálculo';
    }
}

// Función para calcular percentiles de peso según edad y sexo (OMS)
async function calculateWeightPercentile(weight, ageInMonths, sex) {
    
    try {
        // Determinar qué endpoint usar según la edad
        let endpoint;
        let ageRange;
        
        if (ageInMonths <= 60) {
            // 0-5 años: usar tablas originales
            endpoint = `/oms-tables/weight-percentiles?age_months=${ageInMonths}&sex=${sex}`;
            ageRange = "0-5 años";
        } else if (ageInMonths >= 61 && ageInMonths <= 120) {
            // 5-10 años: usar tablas específicas de peso
            endpoint = `/oms-tables/weight-percentiles-5-10?age_months=${ageInMonths}&sex=${sex}`;
            ageRange = "5-10 años";
        } else if (ageInMonths >= 121 && ageInMonths <= 228) {
            // 10-19 años: usar tablas de IMC (no hay datos específicos de peso)
            endpoint = `/oms-tables/bmi-percentiles-5-19?age_months=${ageInMonths}&sex=${sex}`;
            ageRange = "10-19 años (usando tablas IMC)";
        } else {
            forgetAnthroOmsSlice('weight');
            return 'Edad fuera del rango válido (0-19 años)';
        }
        
        
        // Consultar datos oficiales desde el backend
        const response = await fetch(endpoint);
        
        
        if (!response.ok) {
            console.error(`Error consultando tablas OMS de peso (${ageRange}):`, response.statusText);
            forgetAnthroOmsSlice('weight');
            return 'Error consultando datos OMS';
        }
        
        const data = await response.json();
        
        if (!data.success) {
            console.error(`Error en respuesta del servidor:`, data.error);
            forgetAnthroOmsSlice('weight');
            return data.error || 'Error en datos OMS';
        }
        
        const percentiles = data.percentiles;
        if (ageInMonths <= 120) {
            rememberAnthroOmsSlice('weight', weight, percentiles, { ageMonths: ageInMonths, sex, table: `Peso OMS ${ageRange}` });
        } else {
            forgetAnthroOmsSlice('weight');
        }
        
        
        // Lógica correcta para clasificar percentiles según OMS con rangos específicos
        if (weight < percentiles.P15) {
            return 'P<15 (Bajo peso)';
        } else if (weight <= percentiles.P25) {
            return 'P15-P25 (Peso normal)';
        } else if (weight <= percentiles.P50) {
            return 'P25-P50 (Peso normal)';
        } else if (weight <= percentiles.P75) {
            return 'P50-P75 (Peso normal)';
        } else if (weight <= percentiles.P85) {
            return 'P75-P85 (Peso normal)';
        } else if (weight <= percentiles.P95) {
            return 'P85-P95 (Sobrepeso)';
        } else if (weight <= percentiles.P97) {
            return 'P95-P97 (Obesidad)';
        } else {
            return 'P>97 (Obesidad severa)';
        }
        
    } catch (error) {
        console.error('Error calculando percentil de peso:', error);
        forgetAnthroOmsSlice('weight');
        return 'Error en cálculo';
    }
}

// Función para calcular percentiles de perímetro braquial según edad y sexo (OMS)
async function calculateArmPercentile(arm, ageInMonths, sex) {
    
    try {
        // Consultar datos oficiales desde el backend
        const response = await fetch(`/oms-tables/arm-percentiles?age_months=${ageInMonths}&sex=${sex}`);
        
        if (!response.ok) {
            forgetAnthroOmsSlice('arm');
            if (response.status === 404) {
                return 'No aplica para esta edad (sin tabla OMS)';
            }
            console.error('Error consultando tablas OMS de perímetro braquial:', response.statusText);
            return 'Error consultando datos OMS';
        }
        
        const data = await response.json();
        if (!data.success || !data.percentiles) {
            forgetAnthroOmsSlice('arm');
            return data.error || 'Error en datos OMS';
        }
        const percentiles = data.percentiles;
        rememberAnthroOmsSlice('arm', arm, percentiles, { ageMonths: ageInMonths, sex, table: 'Perímetro braquial OMS (tabla 3–5 años)' });
        
        
        // Lógica correcta para clasificar percentiles de perímetro braquial según OMS con rangos específicos
        if (arm < percentiles.P15) {
            return 'P<15 (Perímetro bajo)';
        } else if (arm <= percentiles.P25) {
            return 'P15-P25 (Perímetro normal)';
        } else if (arm <= percentiles.P50) {
            return 'P25-P50 (Perímetro normal)';
        } else if (arm <= percentiles.P75) {
            return 'P50-P75 (Perímetro normal)';
        } else if (arm <= percentiles.P85) {
            return 'P75-P85 (Perímetro normal)';
        } else if (arm <= percentiles.P95) {
            return 'P85-P95 (Perímetro alto)';
        } else if (arm <= percentiles.P97) {
            return 'P95-P97 (Perímetro muy alto)';
        } else {
            return 'P>97 (Perímetro excepcional)';
        }
        
    } catch (error) {
        console.error('Error calculando percentil de perímetro braquial:', error);
        forgetAnthroOmsSlice('arm');
        return 'Error en cálculo';
    }
}

// Función para calcular percentiles de perímetro cefálico según edad y sexo (OMS)
async function calculateHeadPercentile(head, ageInMonths, sex) {
    
    try {
        // Consultar datos oficiales desde el backend
        const response = await fetch(`/oms-tables/head-percentiles?age_months=${ageInMonths}&sex=${sex}`);
        
        if (!response.ok) {
            forgetAnthroOmsSlice('head');
            if (response.status === 404) {
                return 'No aplica para esta edad (sin tabla OMS)';
            }
            console.error('Error consultando tablas OMS de perímetro cefálico:', response.statusText);
            return 'Error consultando datos OMS';
        }
        
        const data = await response.json();
        if (!data.success || !data.percentiles) {
            forgetAnthroOmsSlice('head');
            return data.error || 'Error en datos OMS';
        }
        const percentiles = data.percentiles;
        rememberAnthroOmsSlice('head', head, percentiles, { ageMonths: ageInMonths, sex, table: 'Perímetro cefálico OMS 0–5 años' });
        
        
        // Lógica correcta para clasificar percentiles de perímetro cefálico según OMS con rangos específicos
        if (head < percentiles.P15) {
            return 'P<15 (Perímetro bajo)';
        } else if (head <= percentiles.P25) {
            return 'P15-P25 (Perímetro normal)';
        } else if (head <= percentiles.P50) {
            return 'P25-P50 (Perímetro normal)';
        } else if (head <= percentiles.P75) {
            return 'P50-P75 (Perímetro normal)';
        } else if (head <= percentiles.P85) {
            return 'P75-P85 (Perímetro normal)';
        } else if (head <= percentiles.P95) {
            return 'P85-P95 (Perímetro alto)';
        } else if (head <= percentiles.P97) {
            return 'P95-P97 (Perímetro muy alto)';
        } else {
            return 'P>97 (Perímetro excepcional)';
        }
        
    } catch (error) {
        console.error('Error calculando percentil de perímetro cefálico:', error);
        forgetAnthroOmsSlice('head');
        return 'Error en cálculo';
    }
}

/* ========= Panel visual OMS (percentiles) — medidas antropométricas ========= */
function forgetAnthroOmsSlice(key) {
    if (window.__anthroOmsSnapshot && window.__anthroOmsSnapshot[key]) {
        delete window.__anthroOmsSnapshot[key];
    }
}

function rememberAnthroOmsSlice(key, measuredValue, percentiles, meta) {
    window.__anthroOmsSnapshot = window.__anthroOmsSnapshot || { ageMonths: null, sex: null };
    if (!percentiles || measuredValue === undefined || measuredValue === null || !isFinite(Number(measuredValue))) {
        forgetAnthroOmsSlice(key);
        return;
    }
    window.__anthroOmsSnapshot[key] = {
        value: Number(measuredValue),
        percentiles: Object.assign({}, percentiles),
        meta: meta || {}
    };
    if (meta && meta.ageMonths != null) window.__anthroOmsSnapshot.ageMonths = meta.ageMonths;
    if (meta && meta.sex) window.__anthroOmsSnapshot.sex = meta.sex;
}

function anthroClassifyOmsBand(value, p) {
    if (!isFinite(value) || !p || !isFinite(p.P15) || !isFinite(p.P85) || !isFinite(p.P97)) {
        return { key: 'neutral', label: 'Sin referencia' };
    }
    if (value < p.P15) return { key: 'low', label: 'Por debajo de P15' };
    if (value <= p.P85) return { key: 'normal', label: 'Entre P15 y P85 (habitual)' };
    if (value <= p.P97) return { key: 'watch', label: 'Entre P85 y P97 (vigilar)' };
    return { key: 'high', label: 'Por encima de P97' };
}

function anthroPillClassFromBand(key) {
    if (key === 'normal') return 'lipid-ref-value-pill lipid-ref-value-pill--normal';
    if (key === 'watch') return 'lipid-ref-value-pill lipid-ref-value-pill--borderline';
    if (key === 'low' || key === 'high') return 'lipid-ref-value-pill lipid-ref-value-pill--alert';
    return 'lipid-ref-value-pill lipid-ref-value-pill--neutral';
}

function renderAnthroOmsPercentileBar(value, p) {
    if (!isFinite(value) || !p || !isFinite(p.P3) || !isFinite(p.P97)) return '';
    const lo = Math.min(p.P3, value) - (p.P97 - p.P3) * 0.03;
    const hi = Math.max(p.P97, value) + (p.P97 - p.P3) * 0.03;
    const span = Math.max(hi - lo, 1e-6);
    const pct = v => ((v - lo) / span) * 100;
    const w1 = Math.max(0, pct(p.P15) - pct(lo));
    const w2 = Math.max(0, pct(p.P85) - pct(p.P15));
    const w3 = Math.max(0, pct(p.P97) - pct(p.P85));
    const w4 = Math.max(0, 100 - w1 - w2 - w3);
    const marker = Math.min(100, Math.max(0, pct(value)));
    // Límites entre franjas (mismo sistema de coordenadas que el marcador; no usar space-between en la escala)
    const posP15 = w1;
    const posP85 = w1 + w2;
    const posP97 = w1 + w2 + w3;
    const fmt = x => (isFinite(x) ? Number(x).toFixed(1) : '—');
    const tickAlignClass = pos => {
        if (pos <= 10) return ' anthro-ref-scale-tick--pos-left';
        if (pos >= 88) return ' anthro-ref-scale-tick--pos-right';
        return '';
    };
    const gapRightPct = 100 - posP97;
    const mergeP97Hi = gapRightPct < 5.5 || (hi - p.P97) / span < 0.035;
    const mergeLoP15 = posP15 < 5;

    let numsTop = '';
    if (mergeLoP15) {
        numsTop += `<span class="anthro-ref-scale-tick anthro-ref-scale-tick--start">${lo.toFixed(1)} · ${fmt(p.P15)}</span>`;
    } else {
        numsTop += `<span class="anthro-ref-scale-tick anthro-ref-scale-tick--start">${lo.toFixed(1)}</span>`;
        numsTop += `<span class="anthro-ref-scale-tick${tickAlignClass(posP15)}" style="left:${posP15}%">${fmt(p.P15)}</span>`;
    }
    numsTop += `<span class="anthro-ref-scale-tick${tickAlignClass(posP85)}" style="left:${posP85}%">${fmt(p.P85)}</span>`;
    if (mergeP97Hi) {
        numsTop += `<span class="anthro-ref-scale-tick anthro-ref-scale-tick--end">${fmt(p.P97)} · ${hi.toFixed(1)}</span>`;
    } else {
        numsTop += `<span class="anthro-ref-scale-tick${tickAlignClass(posP97)}" style="left:${posP97}%">${fmt(p.P97)}</span>`;
        numsTop += `<span class="anthro-ref-scale-tick anthro-ref-scale-tick--end">${hi.toFixed(1)}</span>`;
    }

    const labelsBot = `
                <span class="anthro-ref-scale-tick${tickAlignClass(posP15)}" style="left:${posP15}%">P15</span>
                <span class="anthro-ref-scale-tick${tickAlignClass(posP85)}" style="left:${posP85}%">P85</span>
                <span class="anthro-ref-scale-tick${tickAlignClass(posP97)}" style="left:${posP97}%">P97</span>`;

    return `
        <div class="anthro-ref-oms-scale-group">
            <div class="anthro-ref-scale-wrap anthro-ref-scale-wrap--nums" aria-hidden="true">${numsTop}</div>
            <div class="lipid-ref-track">
                <div class="lipid-ref-zone lipid-ref-zone--bad" style="width:${w1}%"></div>
                <div class="lipid-ref-zone lipid-ref-zone--good" style="width:${w2}%"></div>
                <div class="lipid-ref-zone lipid-ref-zone--warn" style="width:${w3}%"></div>
                <div class="lipid-ref-zone lipid-ref-zone--bad" style="width:${w4}%"></div>
                <div class="lipid-ref-marker" style="left:${marker}%"></div>
            </div>
            <div class="anthro-ref-scale-wrap anthro-ref-scale-wrap--labels" aria-hidden="true">${labelsBot}</div>
        </div>`;
}

function renderAnthroMiniCurveSvg(value, p) {
    const keys = ['P3', 'P15', 'P50', 'P85', 'P97'];
    const pts = [];
    keys.forEach(k => {
        if (p && isFinite(p[k])) {
            const x = k === 'P3' ? 3 : k === 'P15' ? 15 : k === 'P50' ? 50 : k === 'P85' ? 85 : 97;
            pts.push({ k, v: p[k], x });
        }
    });
    if (pts.length < 2) return '';
    const vals = pts.map(o => o.v).concat([value]);
    const vmin = Math.min(...vals);
    const vmax = Math.max(...vals);
    const yNorm = v => 38 - ((v - vmin) / Math.max(vmax - vmin, 1e-6)) * 34;
    const xNorm = x => 5 + (x / 100) * 90;
    const line = pts.map(o => `${xNorm(o.x).toFixed(1)},${yNorm(o.v).toFixed(1)}`).join(' ');
    let px = xNorm(50);
    if (value <= pts[0].v) {
        px = xNorm(pts[0].x);
    } else if (value >= pts[pts.length - 1].v) {
        px = xNorm(pts[pts.length - 1].x);
    } else {
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (value >= a.v && value <= b.v && b.v !== a.v) {
                const t = (value - a.v) / (b.v - a.v);
                px = xNorm(a.x + t * (b.x - a.x));
                break;
            }
        }
    }
    const py = yNorm(value);
    return `<svg class="anthro-ref-mini-curve" viewBox="0 0 100 42" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <polyline fill="none" stroke="#3b82f6" stroke-width="1.2" points="${line}" />
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.2" fill="#b91c1c" />
    </svg>
    <p class="anthro-ref-curve-caption">Perfil de referencia OMS a esta edad (eje horizontal ≈ percentil; vertical = magnitud). El punto rojo es el valor del paciente.</p>`;
}

function getAnthropometricReferenceInfoButtonHtml() {
    return `<div class="lipid-ref-info-actions anthro-ref-info-actions">
        <button type="button" class="btn btn-secondary" onclick="openAnthropometricReferenceInfoModal()">
            <i class="fas fa-book-medical"></i> + Información…
        </button>
    </div>`;
}

function escapeHtmlAnthroRef(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildAnthropometricReferenceInfoModalBodyHtml() {
    const snap = window.__anthroOmsSnapshot || {};
    const ageM = snap.ageMonths;
    const sex = snap.sex;
    const ageTxt = ageM == null
        ? 'Sin contexto de edad en el snapshot (complete fecha de nacimiento y referencia).'
        : `Edad para tablas OMS: ${ageM} meses (${(ageM / 12).toFixed(1)} años aprox.). Sexo: ${sex === 'M' ? 'niño' : sex === 'F' ? 'niña' : '—'}.`;

    const rows = ['bmi', 'height', 'weight', 'arm', 'head'].map(k => {
        const s = snap[k];
        if (!s || !s.percentiles) return '';
        const lbl = { bmi: 'IMC (kg/m²)', height: 'Talla (cm)', weight: 'Peso (kg)', arm: 'Perímetro braquial (cm)', head: 'Perímetro cefálico (cm)' }[k];
        const m = s.meta && s.meta.table ? s.meta.table : 'OMS / proyecto';
        const p = s.percentiles;
        const cells = ['P3', 'P15', 'P50', 'P85', 'P97'].map(key =>
            `<td>${isFinite(p[key]) ? p[key].toFixed(2) : '—'}</td>`
        ).join('');
        return `<tr><td>${lbl}</td>${cells}<td>${escapeHtmlAnthroRef(m)}</td></tr>`;
    }).join('');

    return `<div class="lipid-ref-modal-body anthro-ref-modal-body">
        <p class="lipid-ref-details-intro">${escapeHtmlAnthroRef(ageTxt)}</p>
        <h6 class="lipid-ref-details-h">Marco teórico — OMS</h6>
        <ul class="lipid-ref-details-ul">
            <li><strong>Child Growth Standards</strong> (Organización Mundial de la Salud): curvas y tablas de referencia para talla/estatura, peso, IMC y perímetros en población de referencia internacional.</li>
            <li>En esta aplicación, los percentiles mostrados en «Resultados calculados» se obtienen de archivos en la carpeta <code>oms_tables</code> (hojas Excel) servidos por la API <code>/oms-tables/*</code> del backend, según edad en meses y sexo.</li>
            <li>Los rangos P15–P85 y P97 usados en las barras son una <strong>ayuda visual orientativa</strong>; la clasificación clínica oficial debe seguir las guías institucionales y el criterio médico.</li>
        </ul>
        <h6 class="lipid-ref-details-h">Tablas consultadas en esta sesión (valores de referencia a la edad actual)</h6>
        <div class="lipid-ref-table-wrap">
            <table class="lipid-ref-table">
                <thead><tr><th>Indicador</th><th>P3</th><th>P15</th><th>P50</th><th>P85</th><th>P97</th><th>Origen en app</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="7">Aún no hay datos OMS cargados en esta sesión.</td></tr>'}</tbody>
            </table>
        </div>
        <p class="lipid-ref-details-legal">Documentación general OMS sobre crecimiento: <a href="https://www.who.int/tools/child-growth-standards" target="_blank" rel="noopener noreferrer">who.int/tools/child-growth-standards</a>. Las figuras de este modal son esquemáticas y reproducen los mismos puntos de corte que el motor de percentiles cuando hay datos válidos.</p>
    </div>`;
}

let anthropometricReferenceInfoModalEscapeHandler = null;

window.openAnthropometricReferenceInfoModal = function () {
    const modal = document.getElementById('anthropometricReferenceInfoModal');
    const bodyEl = document.getElementById('anthropometricReferenceInfoModalBody');
    if (!modal || !bodyEl) return;
    bodyEl.innerHTML = buildAnthropometricReferenceInfoModalBodyHtml();
    modal.style.display = 'flex';
    if (!anthropometricReferenceInfoModalEscapeHandler) {
        anthropometricReferenceInfoModalEscapeHandler = function (ev) {
            if (ev.key === 'Escape') window.closeAnthropometricReferenceInfoModal();
        };
    }
    document.removeEventListener('keydown', anthropometricReferenceInfoModalEscapeHandler);
    document.addEventListener('keydown', anthropometricReferenceInfoModalEscapeHandler);
};

window.closeAnthropometricReferenceInfoModal = function () {
    const modal = document.getElementById('anthropometricReferenceInfoModal');
    if (modal) modal.style.display = 'none';
    if (anthropometricReferenceInfoModalEscapeHandler) {
        document.removeEventListener('keydown', anthropometricReferenceInfoModalEscapeHandler);
    }
};

function updateAnthropometricReferencePanel() {
    const panel = document.getElementById('anthropometricReferencePanel');
    if (!panel) return;

    const snap = window.__anthroOmsSnapshot || {};
    const ageM = snap.ageMonths;
    const sex = snap.sex;
    const sexLabel = sex === 'M' ? 'niño' : sex === 'F' ? 'niña' : '—';

    const ageLabel = !ageM
        ? 'Complete fecha de nacimiento (y fecha de referencia si aplica) y sexo para posicionar las curvas OMS.'
        : `Referencia OMS para aprox. ${(ageM / 12).toFixed(1)} años, ${sexLabel}.`;

    const metrics = [
        { key: 'bmi', title: 'IMC', unit: 'kg/m²', snapKey: 'bmi' },
        { key: 'height', title: 'Talla / estatura', unit: 'cm', snapKey: 'height' },
        { key: 'weight', title: 'Peso', unit: 'kg', snapKey: 'weight' },
        { key: 'arm', title: 'Perímetro braquial', unit: 'cm', snapKey: 'arm' },
        { key: 'head', title: 'Perímetro cefálico', unit: 'cm', snapKey: 'head' }
    ];

    let cardsHtml = '';
    const scores = [];

    metrics.forEach(m => {
        if (m.key === 'weight' && ageM > 120) return;
        const slice = snap[m.snapKey];
        if (!slice || !slice.percentiles) return;
        const v = slice.value;
        const p = slice.percentiles;
        const band = anthroClassifyOmsBand(v, p);
        scores.push(band.key);
        cardsHtml += `<div class="lipid-ref-card anthro-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">${m.title}</p>
                <span class="${anthroPillClassFromBand(band.key)}">${v.toFixed(m.key === 'bmi' ? 1 : 1)} ${m.unit}</span>
            </div>
            <p class="lipid-ref-ranges">Referencia OMS (P3–P97 a esta edad). Bandas: &lt;P15, P15–P85, P85–P97, &gt;P97.</p>
            ${renderAnthroOmsPercentileBar(v, p)}
            ${renderAnthroMiniCurveSvg(v, p)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado visual:</strong> ${band.label}</p>
        </div>`;
    });

    const hasCards = cardsHtml.length > 0;
    if (!hasCards) {
        panel.innerHTML = '<p class="lipid-ref-empty">Cuando existan percentiles OMS calculados (IMC, talla, peso, perímetros), aquí se mostrará la posición frente a las curvas de referencia.</p>' + getAnthropometricReferenceInfoButtonHtml();
        requestAnimationFrame(() => recalculateAnthropometricExpanderHeight());
        return;
    }

    const abnormal = scores.filter(s => s === 'low' || s === 'high').length;
    const watch = scores.filter(s => s === 'watch').length;
    let concClass = 'lipid-ref-conclusion lipid-ref-conclusion--ok';
    let concText = '';
    if (abnormal > 0) {
        concClass = 'lipid-ref-conclusion lipid-ref-conclusion--alert';
        concText = `Hay ${abnormal} indicador(es) fuera del rango habitual central (P15–P85) según referencia OMS; conviene valoración clínica. `;
    } else if (watch > 0) {
        concClass = 'lipid-ref-conclusion lipid-ref-conclusion--mixed';
        concText = `Hay ${watch} indicador(es) en zona P85–P97; se sugiere seguimiento. `;
    } else {
        concText = 'Los indicadores con referencia disponible se sitúan en la zona central habitual (P15–P85) según tablas OMS cargadas. ';
    }
    concText += 'Los textos de «Resultados calculados» y las tablas PDF de percentiles siguen siendo la referencia detallada.';

    panel.innerHTML = `<p class="lipid-ref-ranges" style="margin-bottom:10px"><strong>Criterios:</strong> ${ageLabel}</p>${cardsHtml}<div class="${concClass}"><strong>Conclusión:</strong> ${concText}</div>${getAnthropometricReferenceInfoButtonHtml()}`;
    requestAnimationFrame(() => recalculateAnthropometricExpanderHeight());
}

/* ========= Panel visual signos vitales (rangos clínicos por edad) ========= */

function getVitalsAgeMonthsOrNull() {
    const birthEl = document.getElementById('birthdate');
    if (!birthEl || !birthEl.value) return null;
    const ageInfo = calculateAgeInYearsAndMonths(birthEl.value, getAnthropometricReferenceDateValue());
    return ageInfo ? ageInfo.totalMonths : null;
}

/** FC en reposo/vigilia (lpm): tramos pediátricos habituales (compilaciones tipo AHA / PALS). */
function getHeartRateRestingReference(ageMonths) {
    if (ageMonths == null || !isFinite(ageMonths)) {
        return { min: 60, max: 100, bracket: 'adulto (sin edad)', refNote: 'AHA: FC en reposo adulta habitual ~60–100 lpm.' };
    }
    if (ageMonths <= 1) return { min: 100, max: 165, bracket: '0–1 mes', refNote: 'Rango habitual publicado en tablas pediátricas de FC (vigilia).' };
    if (ageMonths <= 3) return { min: 100, max: 150, bracket: '1–3 meses', refNote: 'Idem.' };
    if (ageMonths <= 6) return { min: 90, max: 140, bracket: '3–6 meses', refNote: 'Idem.' };
    if (ageMonths <= 12) return { min: 80, max: 120, bracket: '6–12 meses', refNote: 'Idem.' };
    if (ageMonths <= 36) return { min: 70, max: 110, bracket: '1–3 años', refNote: 'Idem.' };
    if (ageMonths <= 60) return { min: 65, max: 110, bracket: '3–5 años', refNote: 'Idem.' };
    if (ageMonths <= 96) return { min: 60, max: 110, bracket: '6–8 años', refNote: 'Idem.' };
    if (ageMonths <= 143) return { min: 60, max: 105, bracket: '9–11 años', refNote: 'Idem.' };
    if (ageMonths <= 216) return { min: 55, max: 100, bracket: '12–17 años', refNote: 'Idem.' };
    return { min: 50, max: 100, bracket: '≥18 años', refNote: 'AHA: adulto en reposo ~50–100 lpm.' };
}

/** FR en resp/min (el formulario guarda rps; se convierte ×4). Rangos habituales por edad. */
function getRespiratoryRateReferenceBpm(ageMonths) {
    if (ageMonths == null || !isFinite(ageMonths)) {
        return { min: 12, max: 20, bracket: 'adulto (sin edad)', refNote: 'FR en reposo adulta habitual ~12–20 /min.' };
    }
    if (ageMonths <= 12) return { min: 25, max: 45, bracket: '0–1 año', refNote: 'Tablas pediátricas de FR en vigilia (referencia habitual).' };
    if (ageMonths <= 36) return { min: 20, max: 35, bracket: '1–3 años', refNote: 'Idem.' };
    if (ageMonths <= 60) return { min: 20, max: 30, bracket: '3–5 años', refNote: 'Idem.' };
    if (ageMonths <= 144) return { min: 15, max: 25, bracket: '6–12 años', refNote: 'Idem.' };
    if (ageMonths <= 216) return { min: 12, max: 20, bracket: '13–17 años', refNote: 'Idem.' };
    return { min: 12, max: 20, bracket: '≥18 años', refNote: 'Idem.' };
}

function vitalsSymmetricAxis(normMin, normMax) {
    const width = Math.max(normMax - normMin, 1);
    const pad = Math.max(15, width * 0.45);
    return {
        axisMin: Math.max(0, normMin - pad),
        axisMax: normMax + pad
    };
}

/** Tres franjas: bajo habitual | habitual | alto habitual (colores malo / bueno / malo). */
function renderVitalsThreeZoneBar(value, axisMin, axisMax, normMin, normMax) {
    const span = Math.max(axisMax - axisMin, 1e-6);
    const w1 = Math.max(0, ((normMin - axisMin) / span) * 100);
    const w2 = Math.max(0, ((normMax - normMin) / span) * 100);
    const w3 = Math.max(0, 100 - w1 - w2);
    const marker = ((value - axisMin) / span) * 100;
    const markerClamped = Math.min(100, Math.max(0, marker));
    const off = value < axisMin || value > axisMax;
    return `
        <div class="lipid-ref-track">
            <div class="lipid-ref-zone lipid-ref-zone--bad" style="width:${w1}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--good" style="width:${w2}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--bad" style="width:${w3}%"></div>
            <div class="lipid-ref-marker" style="left:${markerClamped}%"></div>
        </div>
        <div class="lipid-ref-scale"><span>${axisMin.toFixed(0)}</span><span>${normMin.toFixed(0)}</span><span>${normMax.toFixed(0)}</span><span>${axisMax.toFixed(0)}</span></div>
        ${off ? '<p class="lipid-ref-ranges vitals-ref-offscale"><i class="fas fa-info-circle"></i> Valor fuera de la escala visual; sigue siendo válido en el formulario.</p>' : ''}`;
}

/** SpO₂: eje 75–100 %, franjas &lt;90 (malo), 90–&lt;95 (vigilar), ≥95 (habitual). */
function renderVitalsSpO2Bar(value) {
    const edges = [75, 90, 95, 100];
    const types = ['bad', 'warn', 'good'];
    const axisLo = edges[0];
    const axisHi = edges[edges.length - 1];
    const span = axisHi - axisLo;
    let zones = '';
    for (let i = 0; i < edges.length - 1; i++) {
        const w = ((edges[i + 1] - edges[i]) / span) * 100;
        const cls = types[i] === 'good' ? 'lipid-ref-zone--good' : types[i] === 'warn' ? 'lipid-ref-zone--warn' : 'lipid-ref-zone--bad';
        zones += `<div class="lipid-ref-zone ${cls}" style="width:${w}%"></div>`;
    }
    const marker = Math.min(100, Math.max(0, ((value - axisLo) / span) * 100));
    return `
        <div class="lipid-ref-track">${zones}<div class="lipid-ref-marker" style="left:${marker}%"></div></div>
        <div class="lipid-ref-scale"><span>75%</span><span>90%</span><span>95%</span><span>100%</span></div>`;
}

/** Temperatura °C: hipotermia | normales | fiebre baja | fiebre alta */
function renderVitalsTemperatureBar(value) {
    const edges = [34, 35.5, 36, 38, 39, 41];
    const types = ['bad', 'warn', 'good', 'warn', 'bad'];
    const axisLo = edges[0];
    const axisHi = edges[edges.length - 1];
    const span = axisHi - axisLo;
    let zones = '';
    for (let i = 0; i < edges.length - 1; i++) {
        const w = ((edges[i + 1] - edges[i]) / span) * 100;
        const cls = types[i] === 'good' ? 'lipid-ref-zone--good' : types[i] === 'warn' ? 'lipid-ref-zone--warn' : 'lipid-ref-zone--bad';
        zones += `<div class="lipid-ref-zone ${cls}" style="width:${w}%"></div>`;
    }
    const marker = Math.min(100, Math.max(0, ((value - axisLo) / span) * 100));
    return `
        <div class="lipid-ref-track">${zones}<div class="lipid-ref-marker" style="left:${marker}%"></div></div>
        <div class="lipid-ref-scale"><span>34</span><span>35.5</span><span>36</span><span>38</span><span>39</span><span>41 °C</span></div>`;
}

function classifyVitalsSymmetric(value, normMin, normMax) {
    if (!isFinite(value)) return { key: 'neutral', label: 'Sin dato' };
    const margin = Math.max(5, (normMax - normMin) * 0.22);
    if (value >= normMin && value <= normMax) return { key: 'normal', label: 'Dentro del rango habitual de referencia' };
    if (value >= normMin - margin && value < normMin) return { key: 'watch', label: 'Ligeramente por debajo del tramo habitual' };
    if (value > normMax && value <= normMax + margin) return { key: 'watch', label: 'Ligeramente por encima del tramo habitual' };
    if (value < normMin - margin) return { key: 'low', label: 'Por debajo del rango habitual' };
    return { key: 'high', label: 'Por encima del rango habitual' };
}

function classifyVitalsSpO2(value) {
    if (!isFinite(value)) return { key: 'neutral', label: 'Sin dato' };
    if (value >= 95) return { key: 'normal', label: 'Saturación en rango habitual esperado al aire (≥95%)' };
    if (value >= 90) return { key: 'watch', label: 'SpO₂ 90–94%: vigilancia clínica (criterios generales tipo OMS)' };
    return { key: 'low', label: 'SpO₂ &lt;90%: hipoxemia potencialmente grave según criterios generales OMS' };
}

function classifyVitalsTemperature(value) {
    if (!isFinite(value)) return { key: 'neutral', label: 'Sin dato' };
    if (value >= 36 && value < 38) return { key: 'normal', label: 'Normotermia orientativa (36–&lt;38 °C)' };
    if ((value >= 35.5 && value < 36) || (value >= 38 && value < 39)) return { key: 'watch', label: 'Hipotermia leve o fiebre baja (vigilar contexto)' };
    if (value < 35.5) return { key: 'low', label: 'Hipotermia según umbral orientativo' };
    return { key: 'high', label: 'Fiebre ≥39 °C (orientativo; depende de sitio de medición)' };
}

function updateVitalsReferencePanel() {
    const panel = document.getElementById('vitalsReferencePanel');
    if (!panel) return;

    const ageM = getVitalsAgeMonthsOrNull();
    const ageLabel = ageM == null
        ? 'Indique <strong>fecha de nacimiento</strong> (y fecha de referencia) para ajustar FC y FR por edad. SpO₂ y temperatura usan umbrales generales.'
        : `Edad para referencias de FC/FR: <strong>${(ageM / 12).toFixed(1)} años</strong> (${ageM} meses).`;

    const cards = [];
    const scoreKeys = [];

    const spo2Raw = document.getElementById('oxygenation');
    const spo2 = spo2Raw && spo2Raw.value.trim() !== '' ? parseFloat(spo2Raw.value) : NaN;
    if (isFinite(spo2)) {
        const band = classifyVitalsSpO2(spo2);
        scoreKeys.push(band.key);
        cards.push(`<div class="lipid-ref-card anthro-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Oxigenación (SpO₂)</p>
                <span class="${anthroPillClassFromBand(band.key)}">${spo2.toFixed(1)} %</span>
            </div>
            <p class="lipid-ref-ranges">Referencia visual: &lt;90% (grave), 90–94% (vigilar), ≥95% (habitual al aire, orientación tipo OMS).</p>
            ${renderVitalsSpO2Bar(spo2)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado visual:</strong> ${band.label}</p>
        </div>`);
    }

    const hrRaw = document.getElementById('heartRate');
    const hr = hrRaw && hrRaw.value.trim() !== '' ? parseFloat(hrRaw.value) : NaN;
    if (isFinite(hr)) {
        const ref = getHeartRateRestingReference(ageM);
        const { axisMin, axisMax } = vitalsSymmetricAxis(ref.min, ref.max);
        const band = classifyVitalsSymmetric(hr, ref.min, ref.max);
        scoreKeys.push(band.key);
        cards.push(`<div class="lipid-ref-card anthro-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Frecuencia cardíaca</p>
                <span class="${anthroPillClassFromBand(band.key)}">${hr.toFixed(0)} lpm</span>
            </div>
            <p class="lipid-ref-ranges">Rango habitual <strong>${ref.min}–${ref.max} lpm</strong> (${ref.bracket}). ${ref.refNote}</p>
            ${renderVitalsThreeZoneBar(hr, axisMin, axisMax, ref.min, ref.max)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado visual:</strong> ${band.label}</p>
        </div>`);
    }

    const rrRaw = document.getElementById('respiratoryRate');
    const rr15 = rrRaw && rrRaw.value.trim() !== '' ? parseFloat(rrRaw.value) : NaN;
    const rrMin = isFinite(rr15) ? rr15 * 4 : NaN;
    if (isFinite(rrMin)) {
        const ref = getRespiratoryRateReferenceBpm(ageM);
        const { axisMin, axisMax } = vitalsSymmetricAxis(ref.min, ref.max);
        const band = classifyVitalsSymmetric(rrMin, ref.min, ref.max);
        scoreKeys.push(band.key);
        cards.push(`<div class="lipid-ref-card anthro-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Frecuencia respiratoria</p>
                <span class="${anthroPillClassFromBand(band.key)}">${rrMin.toFixed(0)} /min</span>
            </div>
            <p class="lipid-ref-ranges">Campo en <strong>respiraciones por 15 s</strong>; comparación en <strong>respiraciones por minuto</strong> (= valor × 4). Rango habitual <strong>${ref.min}–${ref.max} /min</strong> (${ref.bracket}).</p>
            ${renderVitalsThreeZoneBar(rrMin, axisMin, axisMax, ref.min, ref.max)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado visual:</strong> ${band.label}</p>
        </div>`);
    }

    const tempRaw = document.getElementById('temperature');
    const temp = tempRaw && tempRaw.value.trim() !== '' ? parseFloat(tempRaw.value) : NaN;
    if (isFinite(temp)) {
        const band = classifyVitalsTemperature(temp);
        scoreKeys.push(band.key);
        cards.push(`<div class="lipid-ref-card anthro-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Temperatura</p>
                <span class="${anthroPillClassFromBand(band.key)}">${temp.toFixed(1)} °C</span>
            </div>
            <p class="lipid-ref-ranges">Escala orientativa 34–41 °C: hipotermia (&lt;35.5), normotermia (36–&lt;38), fiebre baja (38–39), fiebre alta (≥39). El sitio de medición altera los umbrales.</p>
            ${renderVitalsTemperatureBar(temp)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado visual:</strong> ${band.label}</p>
        </div>`);
    }

    if (cards.length === 0) {
        panel.innerHTML = `<p class="lipid-ref-ranges" style="margin-bottom:10px">${ageLabel}</p>
            <p class="lipid-ref-empty">Introduzca al menos un signo vital numérico para ver la posición frente a las referencias.</p>`;
        requestAnimationFrame(() => recalculateAnthropometricExpanderHeight());
        return;
    }

    const abnormal = scoreKeys.filter(k => k === 'low' || k === 'high').length;
    const watch = scoreKeys.filter(k => k === 'watch').length;
    let concClass = 'lipid-ref-conclusion lipid-ref-conclusion--ok';
    let concText = '';
    if (abnormal > 0) {
        concClass = 'lipid-ref-conclusion lipid-ref-conclusion--alert';
        concText = `Hay ${abnormal} parámetro(s) fuera del rango habitual o en zona de alerta según estos criterios orientativos. `;
    } else if (watch > 0) {
        concClass = 'lipid-ref-conclusion lipid-ref-conclusion--mixed';
        concText = `Hay ${watch} parámetro(s) en zona de vigilancia. `;
    } else {
        concText = 'Los signos vitales registrados se sitúan en rangos habituales según las referencias usadas en este panel. ';
    }
    concText += 'La decisión clínica debe integrar historia, exploración y estándares institucionales.';

    panel.innerHTML = `<p class="lipid-ref-ranges" style="margin-bottom:10px">${ageLabel}</p>${cards.join('')}<div class="${concClass}"><strong>Conclusión:</strong> ${concText}</div>`;
    requestAnimationFrame(() => recalculateAnthropometricExpanderHeight());
}

// Calcular IMC automáticamente
document.addEventListener('DOMContentLoaded', function() {
    
    // Establecer fecha máxima para fecha de nacimiento (hoy)
    const birthdateInput = document.getElementById('birthdate');
    if (birthdateInput) {
        const todayIso = getTodayLocalISO();
        birthdateInput.setAttribute('max', todayIso);
    } else {
    }
    
    const heightInput = document.getElementById('height');
    const weightInput = document.getElementById('weight');
    const ageDisplayInput = document.getElementById('ageDisplay');
    const sexInput = document.getElementById('sex');
    const bmiInput = document.getElementById('bmi');
    const bmiPercentileInput = document.getElementById('bmiPercentile');
    
    if (heightInput && weightInput && birthdateInput && ageDisplayInput && sexInput && bmiInput && bmiPercentileInput) {
        async function calculateBMIAndPercentile() {
            try {
            const height = parseFloat(heightInput.value);
            const weight = parseFloat(weightInput.value);
            const birthdate = birthdateInput.value;
            const sex = sexInput.value;
            
            if (height && weight && height > 0) {
                const bmi = weight / Math.pow(height / 100, 2);
                bmiInput.value = bmi.toFixed(1);
                
                // Calcular edad desde fecha de nacimiento
                if (birthdate) {
                    const ageInfo = calculateAgeInYearsAndMonths(birthdate, getAnthropometricReferenceDateValue());
                    if (ageInfo) {
                        ageDisplayInput.value = ageInfo.display;
                        if (ageInfo.totalMonths > 60) {
                            forgetAnthroOmsSlice('head');
                            forgetAnthroOmsSlice('arm');
                        }
                        
                        // Calcular percentiles si tenemos edad y sexo
                        if (sex) {
                            // Percentil de IMC
                            const bmiPercentile = await calculateBMIPercentile(bmi, ageInfo.totalMonths, sex);
                            bmiPercentileInput.value = bmiPercentile;
                            
                            // Percentil de talla
                            const heightPercentile = await calculateHeightPercentile(height, ageInfo.totalMonths, sex);
                            document.getElementById('heightPercentile').value = heightPercentile;
                            
                            // Percentil de peso (solo para niños de 0-10 años)
                            if (ageInfo.totalMonths <= 120) {
                                const weightPercentile = await calculateWeightPercentile(weight, ageInfo.totalMonths, sex);
                                document.getElementById('weightPercentile').value = weightPercentile;
                            } else {
                                forgetAnthroOmsSlice('weight');
                                document.getElementById('weightPercentile').value = 'No aplica para niños mayores de 10 años';
                            }
                            
                            // Percentil de perímetro braquial
                            const arm = parseFloat(document.getElementById('arm').value);
                            if (arm && arm > 0) {
                                const armPercentile = await calculateArmPercentile(arm, ageInfo.totalMonths, sex);
                                document.getElementById('armPercentile').value = armPercentile;
                            }
                            
                            // Percentil de perímetro cefálico
                            const head = parseFloat(document.getElementById('head').value);
                            if (head && head > 0) {
                                const headPercentile = await calculateHeadPercentile(head, ageInfo.totalMonths, sex);
                                document.getElementById('headPercentile').value = headPercentile;
                            }
                        } else {
                            bmiPercentileInput.value = 'Seleccione sexo';
                            document.getElementById('heightPercentile').value = 'Seleccione sexo';
                            document.getElementById('weightPercentile').value = 'Seleccione sexo';
                            document.getElementById('armPercentile').value = 'Seleccione sexo';
                            document.getElementById('headPercentile').value = 'Seleccione sexo';
                        }
                    } else {
                        ageDisplayInput.value = 'Fecha inválida';
                        bmiPercentileInput.value = 'Fecha inválida';
                    }
                } else {
                    ageDisplayInput.value = 'Ingrese fecha de nacimiento';
                    bmiPercentileInput.value = 'Ingrese fecha de nacimiento';
                }
            }
            } finally {
                updateAnthropometricReferencePanel();
                updateVitalsReferencePanel();
            }
        }
        
        // Función para calcular solo la edad cuando cambia la fecha de nacimiento
        async function calculateAgeOnly() {
            try {
            const birthdate = birthdateInput.value;
            if (birthdate) {
                const ageInfo = calculateAgeInYearsAndMonths(birthdate, getAnthropometricReferenceDateValue());
                if (ageInfo) {
                    ageDisplayInput.value = ageInfo.display;
                    if (ageInfo.totalMonths > 60) {
                        forgetAnthroOmsSlice('head');
                        forgetAnthroOmsSlice('arm');
                    }
                    
                    // Configurar campos según la edad
                    const ageConfig = configureFieldsByAge(ageInfo.totalMonths);
                    
                    // Si ya tenemos peso y estatura, recalcular IMC y percentil
                    const height = parseFloat(heightInput.value);
                    const weight = parseFloat(weightInput.value);
                    const sex = sexInput.value;
                    
                    if (height && weight && height > 0 && sex) {
                        const bmi = weight / Math.pow(height / 100, 2);
                        bmiInput.value = bmi.toFixed(1);
                        
                        // Calcular percentiles
                        const bmiPercentile = await calculateBMIPercentile(bmi, ageInfo.totalMonths, sex);
                        bmiPercentileInput.value = bmiPercentile;
                        
                        const heightPercentile = await calculateHeightPercentile(height, ageInfo.totalMonths, sex);
                        document.getElementById('heightPercentile').value = heightPercentile;
                        
                        // Percentil de peso (solo para niños de 0-10 años)
                        if (ageInfo.totalMonths <= 120) {
                            const weightPercentile = await calculateWeightPercentile(weight, ageInfo.totalMonths, sex);
                            document.getElementById('weightPercentile').value = weightPercentile;
                        } else {
                            forgetAnthroOmsSlice('weight');
                            document.getElementById('weightPercentile').value = 'No aplica para niños mayores de 10 años';
                        }
                        
                        // Percentiles de perímetros: se calculan en todas las edades cuando hay valor
                        // (mostrarán la clasificación si existe tabla OMS para la edad).
                        // Percentil de perímetro braquial
                        const arm = parseFloat(document.getElementById('arm').value);
                        if (arm && arm > 0) {
                            const armPercentile = await calculateArmPercentile(arm, ageInfo.totalMonths, sex);
                            document.getElementById('armPercentile').value = armPercentile;
                        }
                        
                        // Percentil de perímetro cefálico
                        const head = parseFloat(document.getElementById('head').value);
                        if (head && head > 0) {
                            const headPercentile = await calculateHeadPercentile(head, ageInfo.totalMonths, sex);
                            document.getElementById('headPercentile').value = headPercentile;
                        }
                    }
                } else {
                    ageDisplayInput.value = 'Fecha inválida';
                }
            } else {
                ageDisplayInput.value = '';
            }
            } finally {
                updateAnthropometricReferencePanel();
                updateVitalsReferencePanel();
            }
        }
        
        heightInput.addEventListener('input', calculateBMIAndPercentile);
        weightInput.addEventListener('input', calculateBMIAndPercentile);
        birthdateInput.addEventListener('change', calculateAgeOnly);
        birthdateInput.addEventListener('input', calculateAgeOnly);
        sexInput.addEventListener('change', calculateBMIAndPercentile);
        
        const anthropometricRefInput = document.getElementById('anthropometricReferenceDate');
        if (anthropometricRefInput) {
            anthropometricRefInput.addEventListener('change', calculateAgeOnly);
            anthropometricRefInput.addEventListener('input', calculateAgeOnly);
        }
        
        // Event listener para perímetro braquial
        const armInput = document.getElementById('arm');
        if (armInput) {
            armInput.addEventListener('input', async function() {
                const arm = parseFloat(this.value);
                const birthdate = birthdateInput.value;
                const sex = sexInput.value;
                
                if (arm && arm > 0 && birthdate && sex) {
                    const ageInfo = calculateAgeInYearsAndMonths(birthdate, getAnthropometricReferenceDateValue());
                    if (ageInfo) {
                        const armPercentile = await calculateArmPercentile(arm, ageInfo.totalMonths, sex);
                        document.getElementById('armPercentile').value = armPercentile;
                    }
                } else {
                    forgetAnthroOmsSlice('arm');
                    document.getElementById('armPercentile').value = '';
                }
                updateAnthropometricReferencePanel();
                updateVitalsReferencePanel();
            });
        }
        
        // Event listener para perímetro cefálico (si existe)
        const headInput = document.getElementById('head');
        if (headInput) {
            headInput.addEventListener('input', async function() {
                const head = parseFloat(this.value);
                const birthdate = birthdateInput.value;
                const sex = sexInput.value;
                
                if (head && head > 0 && birthdate && sex) {
                    const ageInfo = calculateAgeInYearsAndMonths(birthdate, getAnthropometricReferenceDateValue());
                    if (ageInfo) {
                        const headPercentile = await calculateHeadPercentile(head, ageInfo.totalMonths, sex);
                        document.getElementById('headPercentile').value = headPercentile;
                    }
                } else {
                    forgetAnthroOmsSlice('head');
                    document.getElementById('headPercentile').value = '';
                }
                updateAnthropometricReferencePanel();
                updateVitalsReferencePanel();
            });
        }
        updateAnthropometricReferencePanel();
        updateVitalsReferencePanel();
    }
    
    // Calcular relación cintura-cadera
    const waistInput = document.getElementById('waist');
    const hipInput = document.getElementById('hip');
    const waistHipRatioInput = document.getElementById('waistHipRatio');
    
    if (waistInput && hipInput && waistHipRatioInput) {
        function calculateWaistHipRatio() {
            const waist = parseFloat(waistInput.value);
            const hip = parseFloat(hipInput.value);
            
            if (waist && hip && hip > 0) {
                const ratio = waist / hip;
                waistHipRatioInput.value = ratio.toFixed(2);
            }
        }
        
        waistInput.addEventListener('input', calculateWaistHipRatio);
        hipInput.addEventListener('input', calculateWaistHipRatio);
    }

    // Event listeners para validación de medidas antropométricas
    const measurementFields = ['height', 'weight', 'waist', 'arm', 'head', 'oxygenation', 'heartRate', 'respiratoryRate', 'temperature'];
    measurementFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            // Validación en tiempo real mientras se escribe
            field.addEventListener('input', function() {
                validateMeasurementField(fieldId);
                if (fieldId === 'oxygenation' || fieldId === 'heartRate' || fieldId === 'respiratoryRate' || fieldId === 'temperature') {
                    updateVitalsReferencePanel();
                }
            });
            
            // Validación cuando se pierde el foco
            field.addEventListener('blur', function() {
                validateMeasurementField(fieldId);
                if (fieldId === 'oxygenation' || fieldId === 'heartRate' || fieldId === 'respiratoryRate' || fieldId === 'temperature') {
                    updateVitalsReferencePanel();
                }
            });
            
            // Validación cuando se pega texto
            field.addEventListener('paste', function(e) {
                setTimeout(() => {
                    validateMeasurementField(fieldId);
                    if (fieldId === 'oxygenation' || fieldId === 'heartRate' || fieldId === 'respiratoryRate' || fieldId === 'temperature') {
                        updateVitalsReferencePanel();
                    }
                }, 10);
            });
            
            // Prevenir entrada de caracteres no numéricos
            field.addEventListener('keypress', function(e) {
                // Permitir teclas de control (backspace, delete, tab, etc.)
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                
                const char = String.fromCharCode(e.which);
                const currentValue = this.value;
                
                // Permitir solo números
                if (!/[0-9]/.test(char)) {
                    // Permitir punto decimal solo si:
                    // 1. No hay punto ya en el valor
                    // 2. No es el primer carácter
                    if (char === '.' && !currentValue.includes('.') && currentValue.length > 0) {
                        return; // Permitir el punto
                    }
                    e.preventDefault();
                }
            });
        }
    });

    // Cerrar modal al hacer clic fuera de él
    document.addEventListener('click', function(event) {
        const modal = document.getElementById('confirmationModal');
        if (modal && event.target === modal) {
            closeConfirmationModal();
        }
        
        const editModal = document.getElementById('editModal');
        if (editModal && event.target === editModal) {
            closeEditModal();
        }
    });


    // Función para descargar plantillas de medidas antropométricas para todos los pacientes
    window.downloadAllAnthropometricTemplates = function() {
        
        // Verificar que hay una base de datos seleccionada
        if (!selectedDatabase) {
            showToast('Debe seleccionar una base de datos primero', 'error');
            return;
        }
        
        // Crear enlace de descarga con el ID de la base de datos
        const downloadLink = document.createElement('a');
        downloadLink.href = `/download-anthropometric-template/${selectedDatabase.id}`;
        downloadLink.download = `plantilla_medidas_antropometricas_todos.pdf`;
        downloadLink.style.display = 'none';
        
        // Agregar al DOM, hacer clic y remover
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        showToast(`Descargando plantillas para todos los pacientes de la base de datos...`, 'info');
    };

    // Función para mostrar botón de descarga automático
    window.showDownloadButton = function() {
        // Buscar el botón de descarga en el historial de archivos
        const downloadButtons = document.querySelectorAll(`[data-file-id="${selectedDatabase}"] .download-btn`);
        
        if (downloadButtons.length > 0) {
            // Resaltar el botón de descarga
            downloadButtons[0].style.backgroundColor = '#28a745';
            downloadButtons[0].style.color = 'white';
            downloadButtons[0].style.border = '2px solid #28a745';
            downloadButtons[0].style.animation = 'pulse 2s infinite';
            
            // Mostrar mensaje de actualización
            const fileCard = downloadButtons[0].closest('.file-card');
            if (fileCard) {
                let updateMessage = fileCard.querySelector('.update-message');
                if (!updateMessage) {
                    updateMessage = document.createElement('div');
                    updateMessage.className = 'update-message';
                    updateMessage.style.cssText = `
                        background: #d4edda;
                        color: #155724;
                        padding: 8px 12px;
                        border-radius: 4px;
                        margin-top: 8px;
                        font-size: 0.875rem;
                        border: 1px solid #c3e6cb;
                    `;
                    fileCard.appendChild(updateMessage);
                }
                updateMessage.innerHTML = '🔄 <strong>Archivo actualizado</strong> - Contiene nuevas medidas antropométricas';
            }
            
            // Scroll hacia el botón de descarga
            downloadButtons[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            showToast('📥 Archivo actualizado disponible para descarga', 'info');
        }
    };
});



// Función para verificar que el modal de edición esté disponible
function ensureEditModalExists() {
    let modal = document.getElementById('editModal');
    
    if (!modal) {
        console.warn('Modal de edición no encontrado, verificando DOM...');
        
        // Verificar si el HTML se cargó correctamente
        const body = document.body;
        if (!body) {
            console.error('Document body no encontrado');
            return null;
        }
        
        // Buscar el modal en el HTML original
        const modalHTML = `
            <div id="editModal" class="modal-overlay" style="display: none;">
                <div class="modal-content edit-modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-edit"></i> Editar Medidas Antropométricas</h3>
                        <button type="button" class="modal-close" onclick="closeEditModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="editMeasurementsForm">
                            <!-- Sección de datos básicos -->
                            <div class="form-section">
                                <h5><i class="fas fa-user"></i> Datos Básicos del Paciente</h5>
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label for="editBirthdate">Fecha de Nacimiento</label>
                                        <input type="date" id="editBirthdate" max="">
                                    </div>
                                    <div class="form-group">
                                        <label for="editAnthropometricReferenceDate">Fecha de referencia (toma de medidas)</label>
                                        <input type="date" id="editAnthropometricReferenceDate" value="2025-10-28" title="Edad calculada respecto a esta fecha, no a la fecha de hoy">
                                    </div>
                                    <div class="form-group">
                                        <label for="editAgeDisplay">Edad Calculada</label>
                                        <input type="text" id="editAgeDisplay" placeholder="Se calcula automáticamente" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="editSex">Sexo</label>
                                        <select id="editSex">
                                            <option value="">Seleccionar...</option>
                                            <option value="M">Masculino</option>
                                            <option value="F">Femenino</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Sección de medidas antropométricas -->
                            <div class="form-section">
                                <h5><i class="fas fa-ruler"></i> Medidas Antropométricas</h5>
                                <p class="numeric-note" style="color: #dc3545; font-size: 0.875rem; margin: -10px 0 15px 0; font-weight: 500;">
                                    <i class="fas fa-info-circle"></i> Solo admite valores numéricos positivos
                                </p>
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label for="editHeight">Estatura (cm)</label>
                                        <input type="number" id="editHeight" step="0.1" placeholder="Ej: 120.5" min="0">
                                    </div>
                                    <div class="form-group">
                                        <label for="editWeight">Peso (kg)</label>
                                        <input type="number" id="editWeight" step="0.1" placeholder="Ej: 25.3" min="0">
                                    </div>
                                    <div class="form-group">
                                        <label for="editWaist">Circunferencia de Cintura (cm)</label>
                                        <input type="number" id="editWaist" step="0.1" placeholder="Ej: 60.5" min="0">
                                    </div>
                                    <div class="form-group">
                                        <label for="editArm">Perímetro Braquial (cm)</label>
                                        <input type="number" id="editArm" step="0.1" placeholder="Ej: 18.2" min="0">
                                    </div>
                                    <div class="form-group">
                                        <label for="editHead">Perímetro Cefálico (cm)</label>
                                        <input type="number" id="editHead" step="0.1" placeholder="Ej: 52.1" min="0">
                                    </div>
                                </div>
                            </div>

                            <!-- Sección de resultados calculados -->
                            <div class="form-section">
                                <h5><i class="fas fa-calculator"></i> Resultados Calculados</h5>
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label for="editBmi">IMC</label>
                                        <input type="text" id="editBmi" placeholder="Se calcula automáticamente" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="editBmiPercentile">Percentil IMC</label>
                                        <input type="text" id="editBmiPercentile" placeholder="Según OMS" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="editHeightPercentile">Percentil Talla</label>
                                        <input type="text" id="editHeightPercentile" placeholder="Según OMS" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="editWeightPercentile">Percentil Peso</label>
                                        <input type="text" id="editWeightPercentile" placeholder="Según OMS" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="editArmPercentile">Percentil Perímetro Braquial</label>
                                        <input type="text" id="editArmPercentile" placeholder="Según OMS" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="editHeadPercentile">Percentil Perímetro Cefálico</label>
                                        <input type="text" id="editHeadPercentile" placeholder="Según OMS" readonly>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeEditModal()">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button type="button" class="btn btn-success" onclick="updatePatientMeasurements()">
                            <i class="fas fa-save"></i> Registrar Medida
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Crear el modal dinámicamente
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = modalHTML;
        modal = tempDiv.firstElementChild;
        
        // Agregar al DOM
        document.body.appendChild(modal);
    }
    
    return modal;
}

// Función para mostrar modal de edición
window.showEditModal = function(patientId, patientData) {
    
    // Verificar que tenemos datos del paciente
    if (!patientData) {
        console.error('No hay datos del paciente');
        showToast('Error: No hay datos del paciente', 'error');
        return;
    }
    
    // Asegurar que el modal de edición existe
    const modal = ensureEditModalExists();
    if (!modal) {
        console.error('No se pudo crear o encontrar el modal de edición');
        showToast('Error: No se pudo crear el modal de edición', 'error');
        return;
    }
    
    
    // Llenar el formulario con los datos actuales
    try {
    fillEditForm(patientId, patientData);
    
    // Mostrar el modal
    modal.style.display = 'flex';
        
        // Asegurar que el modal esté visible
        setTimeout(() => {
            if (modal.style.display !== 'flex') {
                modal.style.display = 'flex';
            }
        }, 100);
        
    } catch (error) {
        console.error('Error llenando formulario:', error);
        showToast('Error al cargar datos en el formulario', 'error');
    }
};

// Función para cerrar modal de edición
window.closeEditModal = function() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Función para llenar el formulario de edición
function fillEditForm(patientId, patientData) {
    
    try {
        // Datos básicos
        const birthdateField = document.getElementById('editBirthdate');
        const ageField = document.getElementById('editAgeDisplay');
        const sexField = document.getElementById('editSex');
        
        if (birthdateField) {
            birthdateField.value = patientData.Fecha_Nacimiento || '';
        }
        const editRefField = document.getElementById('editAnthropometricReferenceDate');
        if (editRefField) {
            editRefField.value = patientData.Fecha_Referencia_Medidas || '2025-10-28';
        }
        if (ageField) {
            if (birthdateField && birthdateField.value) {
                const ai = calculateAgeInYearsAndMonths(birthdateField.value, getEditAnthropometricReferenceDateValue());
                ageField.value = ai ? ai.display : (patientData.Edad_Calculada || '');
            } else {
            ageField.value = patientData.Edad_Calculada || '';
            }
        }
        if (sexField) {
            // Intentar obtener el sexo de diferentes campos posibles
            let sexValue = patientData.Sexo_Medidas || patientData.Sexo || '';
            
            // Limpiar el valor si es 'NaT' o vacío
            if (sexValue === 'NaT' || sexValue === '' || sexValue === null || sexValue === undefined) {
                sexValue = '';
            }
            
            sexField.value = sexValue;
        }
        
        // Medidas antropométricas
        const heightField = document.getElementById('editHeight');
        const weightField = document.getElementById('editWeight');
        const waistField = document.getElementById('editWaist');
        const armField = document.getElementById('editArm');
        const headField = document.getElementById('editHead');
        
        if (heightField) {
            heightField.value = patientData.Estatura_cm || '';
        }
        if (weightField) {
            weightField.value = patientData.Peso_kg || '';
        }
        if (waistField) {
            waistField.value = patientData.Circunferencia_Cintura_cm || '';
        }
        if (armField) {
            armField.value = patientData.Perimetro_Braquial_cm || '';
        }
        if (headField) {
            headField.value = patientData.Perimetro_Cefalico_cm || '';
        }
        
        const oxygenationField = document.getElementById('editOxygenation');
        if (oxygenationField) {
            oxygenationField.value = patientData.Oxigenacion_pct || patientData.Oxigenacion || '';
        }
        const heartRateField = document.getElementById('editHeartRate');
        if (heartRateField) {
            heartRateField.value = patientData.Frecuencia_Cardiaca_lpm || patientData.Frecuencia_Cardiaca || '';
        }
        const respiratoryRateField = document.getElementById('editRespiratoryRate');
        if (respiratoryRateField) {
            let respiratoryRateValue = patientData.Frecuencia_Respiratoria_15s || patientData.Frecuencia_Respiratoria || '';
            const respiratoryRatePerMinute = patientData.Frecuencia_Respiratoria_min || patientData.Frecuencia_Respiratoria_Min || patientData.FRECUENCIA_RESPIRATORIA_MIN;
            if ((respiratoryRatePerMinute !== undefined && respiratoryRatePerMinute !== null && respiratoryRatePerMinute !== '') && isFinite(respiratoryRatePerMinute)) {
                const numericValue = parseFloat(respiratoryRatePerMinute);
                if (!isNaN(numericValue)) {
                    respiratoryRateValue = (numericValue / 4).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
                }
            }
            respiratoryRateField.value = respiratoryRateValue;
        }
        const temperatureField = document.getElementById('editTemperature');
        if (temperatureField) {
            temperatureField.value = patientData.Temperatura_C || patientData.Temperatura || '';
        }
        
        // Resultados calculados
        const bmiField = document.getElementById('editBmi');
        const bmiPercentileField = document.getElementById('editBmiPercentile');
        const heightPercentileField = document.getElementById('editHeightPercentile');
        const weightPercentileField = document.getElementById('editWeightPercentile');
        const armPercentileField = document.getElementById('editArmPercentile');
        const headPercentileField = document.getElementById('editHeadPercentile');
        
        if (bmiField) {
            // Aplicar formato de redondeo al IMC
            const bmiValue = patientData.IMC_Calculado || '';
            if (bmiValue && !isNaN(parseFloat(bmiValue))) {
                bmiField.value = parseFloat(bmiValue).toFixed(1);
            } else {
                bmiField.value = bmiValue;
            }
        }
        if (bmiPercentileField) {
            bmiPercentileField.value = patientData.Percentil_IMC || '';
        }
        if (heightPercentileField) {
            heightPercentileField.value = patientData.Percentil_Talla || '';
        }
        if (weightPercentileField) {
            weightPercentileField.value = patientData.Percentil_Peso || '';
        }
        if (armPercentileField) {
            armPercentileField.value = patientData.Percentil_Perimetro_Braquial || '';
        }
        if (headPercentileField) {
            headPercentileField.value = patientData.Percentil_Perimetro_Cefalico || '';
        }
        
        // Guardar el ID del paciente para la actualización
        window.editingPatientId = patientId;
        
        // Configurar campos según la edad del paciente
        if (birthdateField && birthdateField.value) {
            const ageInfo = calculateAgeInYearsAndMonths(birthdateField.value, getEditAnthropometricReferenceDateValue());
            if (ageInfo) {
                configureFieldsByAge(ageInfo.totalMonths);
            }
        }
        
        
        // Agregar event listeners para cálculos automáticos en el modal de edición
        setupEditModalEventListeners();
        
    } catch (error) {
        console.error('Error llenando formulario:', error);
        throw error; // Re-lanzar el error para que sea manejado por la función llamadora
    }
}

// Función para configurar event listeners del modal de edición
function setupEditModalEventListeners() {
    const editHeightInput = document.getElementById('editHeight');
    const editWeightInput = document.getElementById('editWeight');
    const editBirthdateInput = document.getElementById('editBirthdate');
    const editAgeDisplayInput = document.getElementById('editAgeDisplay');
    const editSexInput = document.getElementById('editSex');
    const editBmiInput = document.getElementById('editBmi');
    const editBmiPercentileInput = document.getElementById('editBmiPercentile');
    const editHeightPercentileInput = document.getElementById('editHeightPercentile');
    const editWeightPercentileInput = document.getElementById('editWeightPercentile');
    const editArmInput = document.getElementById('editArm');
    const editArmPercentileInput = document.getElementById('editArmPercentile');
    const editHeadInput = document.getElementById('editHead');
    const editHeadPercentileInput = document.getElementById('editHeadPercentile');
    
    if (editHeightInput && editWeightInput && editBirthdateInput && editAgeDisplayInput && editSexInput && editBmiInput && editBmiPercentileInput) {
        // Función para calcular IMC y percentiles en el modal de edición
        async function calculateEditBMIAndPercentile() {
            const height = parseFloat(editHeightInput.value);
            const weight = parseFloat(editWeightInput.value);
            const birthdate = editBirthdateInput.value;
            const sex = editSexInput.value;
            
            if (height && weight && height > 0) {
                const bmi = weight / Math.pow(height / 100, 2);
                editBmiInput.value = bmi.toFixed(1);
                
                // Calcular edad desde fecha de nacimiento
                if (birthdate) {
                    const ageInfo = calculateAgeInYearsAndMonths(birthdate, getEditAnthropometricReferenceDateValue());
                    if (ageInfo) {
                        editAgeDisplayInput.value = ageInfo.display;
                        
                        // Calcular percentiles si tenemos edad y sexo
                        if (sex) {
                            // Percentil de IMC
                            const bmiPercentile = await calculateBMIPercentile(bmi, ageInfo.totalMonths, sex);
                            editBmiPercentileInput.value = bmiPercentile;
                            
                            // Percentil de talla
                            const heightPercentile = await calculateHeightPercentile(height, ageInfo.totalMonths, sex);
                            editHeightPercentileInput.value = heightPercentile;
                            
                            // Percentil de peso (solo para niños de 0-10 años)
                            if (ageInfo.totalMonths <= 120) {
                                const weightPercentile = await calculateWeightPercentile(weight, ageInfo.totalMonths, sex);
                                editWeightPercentileInput.value = weightPercentile;
                            } else {
                                editWeightPercentileInput.value = 'No aplica para niños mayores de 10 años';
                            }
                        }
                    }
                }
            }
        }
        
        // Función para calcular solo la edad y reconfigurar campos
        function calculateEditAgeOnly() {
            const birthdate = editBirthdateInput.value;
            if (birthdate) {
                const ageInfo = calculateAgeInYearsAndMonths(birthdate, getEditAnthropometricReferenceDateValue());
                if (ageInfo) {
                    editAgeDisplayInput.value = ageInfo.display;
                    
                    // Reconfigurar campos según la nueva edad
                    configureFieldsByAge(ageInfo.totalMonths);
                    
                    // Si ya tenemos peso y estatura, recalcular IMC y percentiles con las nuevas tablas
                    const height = parseFloat(editHeightInput.value);
                    const weight = parseFloat(editWeightInput.value);
                    const sex = editSexInput.value;
                    
                    if (height && weight && height > 0 && sex) {
                        const bmi = weight / Math.pow(height / 100, 2);
                        editBmiInput.value = bmi.toFixed(1);
                        
                        // Calcular percentiles con las tablas correctas según la nueva edad
                        calculateEditBMIAndPercentile();
                    }
                }
            }
        }
        
        // Event listeners para el modal de edición
        editHeightInput.addEventListener('input', calculateEditBMIAndPercentile);
        editWeightInput.addEventListener('input', calculateEditBMIAndPercentile);
        editBirthdateInput.addEventListener('input', calculateEditAgeOnly);
        
        const editAnthropometricRefInput = document.getElementById('editAnthropometricReferenceDate');
        if (editAnthropometricRefInput) {
            editAnthropometricRefInput.addEventListener('change', calculateEditAgeOnly);
            editAnthropometricRefInput.addEventListener('input', calculateEditAgeOnly);
        }
        
        // Agregar validación de entrada numérica a los campos de medidas
        const editMeasurementFields = ['editHeight', 'editWeight', 'editWaist', 'editArm', 'editHead', 'editOxygenation', 'editHeartRate', 'editRespiratoryRate', 'editTemperature'];
        
        editMeasurementFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                // Validación en tiempo real mientras se escribe
                field.addEventListener('input', function() {
                    validateEditMeasurementField(fieldId);
                });
                
                // Validación cuando se pierde el foco
                field.addEventListener('blur', function() {
                    validateEditMeasurementField(fieldId);
                });
                
                // Validación cuando se pega texto
                field.addEventListener('paste', function(e) {
                    setTimeout(() => {
                        validateEditMeasurementField(fieldId);
                    }, 10);
                });
                
                // Prevenir entrada de caracteres no numéricos
                field.addEventListener('keypress', function(e) {
                    // Permitir teclas de control (backspace, delete, tab, etc.)
                    if (e.ctrlKey || e.metaKey || e.altKey) return;
                    
                    const char = String.fromCharCode(e.which);
                    const currentValue = this.value;
                    
                    // Permitir solo números
                    if (!/[0-9]/.test(char)) {
                        // Permitir punto decimal solo si:
                        // 1. No hay punto ya en el valor
                        // 2. No es el primer carácter
                        if (char === '.' && !currentValue.includes('.') && currentValue.length > 0) {
                            return; // Permitir el punto
                        }
                        e.preventDefault();
                    }
                });
            }
        });
        
        // Event listeners para percentiles de perímetro braquial
        if (editArmInput && editArmPercentileInput) {
            editArmInput.addEventListener('input', async function() {
                const arm = parseFloat(editArmInput.value);
                const birthdate = editBirthdateInput.value;
                const sex = editSexInput.value;
                
                if (arm && arm > 0 && birthdate && sex) {
                    const ageInfo = calculateAgeInYearsAndMonths(birthdate, getEditAnthropometricReferenceDateValue());
                    if (ageInfo) {
                        const armPercentile = await calculateArmPercentile(arm, ageInfo.totalMonths, sex);
                        editArmPercentileInput.value = armPercentile;
                    }
                }
            });
        }
        
        // Event listeners para percentiles de perímetro cefálico
        if (editHeadInput && editHeadPercentileInput) {
            editHeadInput.addEventListener('input', async function() {
                const head = parseFloat(editHeadInput.value);
                const birthdate = editBirthdateInput.value;
                const sex = editSexInput.value;
                
                if (head && head > 0 && birthdate && sex) {
                    const ageInfo = calculateAgeInYearsAndMonths(birthdate, getEditAnthropometricReferenceDateValue());
                    if (ageInfo) {
                        const headPercentile = await calculateHeadPercentile(head, ageInfo.totalMonths, sex);
                        editHeadPercentileInput.value = headPercentile;
                    }
                }
            });
        }
        
    }
}

// Función para actualizar medidas del paciente
window.updatePatientMeasurements = async function() {
    
    // Validar datos requeridos
    const height = document.getElementById('editHeight').value;
    const weight = document.getElementById('editWeight').value;
    
    if (!height || !weight) {
        showToast('Estatura y peso son campos requeridos', 'error');
        return;
    }
    
    // Validar que todos los campos de medidas sean números positivos
    const editMeasurementFields = ['editHeight', 'editWeight', 'editWaist', 'editArm', 'editHead', 'editOxygenation', 'editHeartRate', 'editRespiratoryRate', 'editTemperature'];
    let hasErrors = false;
    
    editMeasurementFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field && field.value.trim() !== '') {
            if (!validateEditMeasurementField(fieldId)) {
                hasErrors = true;
            }
        }
    });
    
    if (hasErrors) {
        showToast('Por favor corrige los errores en los campos de medidas', 'error');
        return;
    }
    
    // Preparar datos para enviar
    const formData = new FormData();
    formData.append('patient_id', window.editingPatientId);
    formData.append('database_id', selectedDatabase.id);
    formData.append('birthdate', document.getElementById('editBirthdate').value);
    formData.append('ageDisplay', document.getElementById('editAgeDisplay').value);
    formData.append('sex', document.getElementById('editSex').value);
    formData.append('height', height);
    formData.append('weight', weight);
    formData.append('waist', document.getElementById('editWaist').value);
    formData.append('arm', document.getElementById('editArm').value);
    formData.append('head', document.getElementById('editHead').value);
    
    // Agregar valores calculados con formato correcto
    const safeGetValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value : '';
    };
    
    formData.append('bmi', safeGetValue('editBmi'));
    formData.append('bmiPercentile', safeGetValue('editBmiPercentile'));
    formData.append('heightPercentile', safeGetValue('editHeightPercentile'));
    formData.append('weightPercentile', safeGetValue('editWeightPercentile'));
    formData.append('armPercentile', safeGetValue('editArmPercentile'));
    formData.append('headPercentile', safeGetValue('editHeadPercentile'));
    formData.append('oxygenation', safeGetValue('editOxygenation'));
    formData.append('heartRate', safeGetValue('editHeartRate'));
    formData.append('respiratoryRate', safeGetValue('editRespiratoryRate'));
    formData.append('temperature', safeGetValue('editTemperature'));
    formData.append('anthropometricReferenceDate', safeGetValue('editAnthropometricReferenceDate'));
    
    try {
        const response = await fetch('/update-anthropometric-data', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showConfirmationModal(
                window.editingPatientId,
                selectedDatabase.id,
                'Medidas actualizadas',
                'Las medidas antropométricas se actualizaron correctamente.',
                { afterClose: 'anthropometric-patients' }
            );
            showToast('Medidas antropométricas actualizadas correctamente', 'success');
            closeEditModal();
            
            // Actualizar la lista de pacientes para mostrar el icono de editar
            displayPatients(allPatients);
            
        } else {
            showToast('Error al actualizar: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error actualizando medidas:', error);
        showToast('Error al actualizar las medidas', 'error');
    }
};

// Función para manejar el expander de Medidas Antropométricas
function toggleAnthropometricExpander() {
    const content = document.getElementById('anthropometricExpanderContent');
    const icon = document.getElementById('anthropometricExpanderIcon');
    
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
        window.setTimeout(() => {
            recalculateAnthropometricExpanderHeight();
        }, 350);
    }
}

// Inicializar los expanders como cerrados por defecto
document.addEventListener('DOMContentLoaded', function() {
    // Expander de medidas antropométricas
    const anthropometricContent = document.getElementById('anthropometricExpanderContent');
    const anthropometricIcon = document.getElementById('anthropometricExpanderIcon');
    
    if (anthropometricContent && anthropometricIcon) {
        anthropometricContent.style.maxHeight = '0';
        anthropometricContent.classList.remove('expanded');
        anthropometricIcon.classList.remove('expanded');
    }
    
    // Expander de perfil lipídico
    const lipidContent = document.getElementById('lipidProfileExpanderContent');
    const lipidIcon = document.getElementById('lipidProfileExpanderIcon');
    
    if (lipidContent && lipidIcon) {
        lipidContent.style.maxHeight = '0';
        lipidContent.classList.remove('expanded');
        lipidIcon.classList.remove('expanded');
    }
});

// ==================== FUNCIONES PARA PERFIL LIPÍDICO ====================

// Variables globales para perfil lipídico
let selectedLipidDatabase = null;
let selectedLipidPatient = null;
let allLipidPatients = [];

// Función para alternar el expander de perfil lipídico
window.toggleLipidProfileExpander = function() {
    const content = document.getElementById('lipidProfileExpanderContent');
    const icon = document.getElementById('lipidProfileExpanderIcon');
    
    if (content.classList.contains('expanded')) {
        // Cerrar: pasar de altura real a 0 para que la transición sea visible
        content.style.maxHeight = `${content.scrollHeight}px`;
        void content.offsetHeight;
        content.classList.remove('expanded');
        icon.classList.remove('expanded');
        requestAnimationFrame(() => {
        content.style.maxHeight = '0';
        });
    } else {
        // Abrir: animar desde 0 y luego dejar crecer el contenido sin tope fijo
        content.classList.add('expanded');
        icon.classList.add('expanded');
        content.style.maxHeight = content.scrollHeight + 'px';
        loadLipidDatabases();
        window.setTimeout(() => {
            recalculateLipidExpanderHeight();
        }, 350);
    }
};

// Cargar bases de datos para perfil lipídico
async function loadLipidDatabases() {
    try {
        const response = await fetch('/files');
        const result = await response.json();
        
        
        if (result.success && result.files.length > 0) {
            displayLipidDatabases(result.files);
        } else {
            showEmptyLipidDatabases();
        }
    } catch (error) {
        console.error('Error loading databases for lipid profile:', error);
        showEmptyLipidDatabases();
    }
}

// Mostrar bases de datos para perfil lipídico
function displayLipidDatabases(files) {
    const databasesGrid = document.getElementById('lipidDatabasesGrid');
    const emptyDatabases = document.getElementById('lipidEmptyDatabases');
    
    if (!databasesGrid) {
        console.error('Elemento lipidDatabasesGrid no encontrado');
        return;
    }
    
    if (files.length === 0) {
        showEmptyLipidDatabases();
        return;
    }
    
    
    // Ocultar mensaje vacío si existe
    if (emptyDatabases) {
        emptyDatabases.style.display = 'none';
    }
    
    databasesGrid.innerHTML = files.map(file => `
        <div class="database-item" onclick="selectLipidDatabase('${file.id}')">
            <h5>${file.original_filename}</h5>
            <p><i class="fas fa-table"></i> ${file.rows} filas</p>
            <p><i class="fas fa-columns"></i> ${file.columns.length} columnas</p>
            <p><i class="fas fa-calendar"></i> ${formatDate(file.created_at)}</p>
            <button class="btn-select" onclick="event.stopPropagation(); selectLipidDatabase('${file.id}')">
                <i class="fas fa-check"></i> Seleccionar
            </button>
        </div>
    `).join('');
    requestAnimationFrame(() => recalculateLipidExpanderHeight());
}

// Mostrar estado vacío para perfil lipídico
function showEmptyLipidDatabases() {
    const databasesGrid = document.getElementById('lipidDatabasesGrid');
    const emptyDatabases = document.getElementById('lipidEmptyDatabases');
    
    if (!databasesGrid) {
        console.error('Elemento lipidDatabasesGrid no encontrado en showEmptyLipidDatabases');
        return;
    }
    
    databasesGrid.innerHTML = '';
    databasesGrid.appendChild(emptyDatabases);
    requestAnimationFrame(() => recalculateLipidExpanderHeight());
}

// Seleccionar base de datos para perfil lipídico
async function selectLipidDatabase(databaseId) {
    try {
        showLoading('Cargando base de datos...');
        
        const response = await fetch(`/files/${databaseId}/complete`);
        const result = await response.json();
        
        if (result.success) {
            selectedLipidDatabase = { id: databaseId, data: result.data };
            allLipidPatients = result.data.map(row => ({
                id: row.ID_Unico,
                has_lipid_profile: hasLipidProfileData(row)
            }));
            
            // Ocultar selector de base de datos y mostrar selector de pacientes
            document.getElementById('lipidDatabaseSelector').style.display = 'none';
            document.getElementById('lipidPatientSelector').style.display = 'block';
            
            // Mostrar pacientes
            displayLipidPatients(allLipidPatients);
            
            hideLoading();
        } else {
            hideLoading();
            showToast('Error cargando base de datos: ' + (result.message || 'Error desconocido'), 'error');
        }
    } catch (error) {
        hideLoading();
        console.error('Error seleccionando base de datos:', error);
        showToast('Error cargando base de datos', 'error');
    }
}

// Verificar si un paciente ya tiene datos de perfil lipídico
function hasLipidProfileData(row) {
    const lipidColumns = ['Colesterol_Total_mg_dL', 'HDL_Colesterol_mg_dL', 'LDL_Colesterol_mg_dL', 'Trigliceridos_mg_dL'];
    return lipidColumns.some(col => row[col] !== undefined && row[col] !== null && row[col] !== '');
}

// Verificar si un paciente tiene medidas antropométricas registradas
function hasAnthropometricData(row) {
    const anthropometricColumns = ['Estatura_cm', 'Peso_kg', 'IMC_kg_m2', 'Circunferencia_Cintura_cm', 'Perimetro_Braquial_cm'];
    return anthropometricColumns.some(col => row[col] !== undefined && row[col] !== null && row[col] !== '');
}


// Mostrar pacientes para perfil lipídico
function displayLipidPatients(patients) {
    const patientList = document.getElementById('lipidPatientList');
    patientList.innerHTML = '';
    
    patients.forEach(patient => {
        const patientItem = document.createElement('div');
        patientItem.className = 'patient-item';
        patientItem.onclick = () => selectLipidPatient(patient);
        
        // Verificar si el paciente tiene medidas antropométricas
        const patientData = selectedLipidDatabase.data.find(row => row.ID_Unico === patient.id);
        const hasAnthropometric = patientData ? hasAnthropometricData(patientData) : false;
        
        const statusIcon = patient.has_lipid_profile ? 
            '<i class="fas fa-check-circle text-success"></i>' : 
            '<i class="fas fa-plus-circle text-primary"></i>';
        
        const statusText = patient.has_lipid_profile ? 
            'Perfil lipídico registrado' : 
            'Sin perfil lipídico';
        
        const buttonIcon = patient.has_lipid_profile ? 
            'fas fa-edit' : 
            'fas fa-plus';
        
        const buttonTitle = patient.has_lipid_profile ? 
            'Editar perfil lipídico' : 
            'Agregar perfil lipídico';
        
        // Crear iconos de estado adicionales
        const anthropometricIcon = hasAnthropometric ? 
            '<i class="fas fa-ruler text-success" title="Medidas antropométricas registradas"></i>' : 
            '<i class="fas fa-ruler text-muted" title="Sin medidas antropométricas"></i>';
        
        patientItem.innerHTML = `
            <div class="patient-info">
                <h6><i class="fas fa-user"></i> Paciente ${patient.id}</h6>
                <div class="patient-status">
                    <p>${statusIcon} ${statusText}</p>
                    <p>${anthropometricIcon} ${hasAnthropometric ? 'Medidas antropométricas ✓' : 'Sin medidas antropométricas'}</p>
                </div>
            </div>
            <div class="patient-actions">
                <button type="button" class="report-btn" ${patient.has_lipid_profile ? '' : 'disabled'} onclick="event.stopPropagation(); openLipidParentReport('${patient.id}', ${patient.has_lipid_profile})" title="${patient.has_lipid_profile ? 'Reporte para padres/tutores' : 'Sin perfil lipídico para reporte'}">
                    <i class="fas fa-file-medical-alt"></i>
                </button>
                <button class="edit-btn" title="${buttonTitle}">
                    <i class="${buttonIcon}"></i>
                </button>
            </div>
        `;
        
        // Agregar event listener al botón
        const button = patientItem.querySelector('.edit-btn');
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (patient.has_lipid_profile) {
                editLipidPatient(patient);
            } else {
                selectLipidPatient(patient);
            }
        });
        
        patientList.appendChild(patientItem);
    });
}

// Seleccionar paciente para perfil lipídico
async function selectLipidPatient(patient) {
    
    selectedLipidPatient = patient;
    
    // Verificar si el paciente ya tiene perfil lipídico registrado
    try {
        const response = await fetch(`/check-patient-lipid-profile/${selectedLipidDatabase.id}/${patient.id}`);
        
        if (!response.ok) {
            proceedWithLipidPatientSelection(patient);
            return;
        }
        
        const result = await response.json();
        
        if (result.has_lipid_profile) {
            // Mostrar mensaje de que ya fue procesado
            showLipidPatientAlreadyProcessedModal(patient.id);
            return;
        }
        
        // Si no tiene perfil lipídico, continuar normalmente
        proceedWithLipidPatientSelection(patient);
        
    } catch (error) {
        console.error('Error verificando perfil lipídico:', error);
        // En caso de error, permitir el procesamiento normal
        proceedWithLipidPatientSelection(patient);
    }
}

function proceedWithLipidPatientSelection(patient) {
    
    // Ocultar selector de pacientes y mostrar formulario
    document.getElementById('lipidPatientSelector').style.display = 'none';
    document.getElementById('lipidProfileForm').style.display = 'block';
    
    // Mostrar información del paciente
    displayLipidPatientInfo(patient);
    
    // Limpiar formulario
    resetLipidProfileForm();
    
    // Llenar automáticamente edad y sexo desde la base de datos
    fillLipidPatientDataFromDatabase(patient);
    
    // Agregar event listeners para cálculos automáticos
    addLipidCalculationListeners();
    
    // Recalcular el tamaño del expander después de mostrar el formulario
    setTimeout(() => {
        recalculateLipidExpanderHeight();
    }, 100);
}

/**
 * El acordeón usa max-height animado; si queda fijado en px (scrollHeight al abrir),
 * cualquier bloque que crezca después (p. ej. interpretación lipídica) queda recortado.
 * Con el panel expandido usamos "none" para que la altura siga al contenido real.
 */
function recalculateLipidExpanderHeight() {
    const content = document.getElementById('lipidProfileExpanderContent');
    if (!content || !content.classList.contains('expanded')) return;
    content.style.maxHeight = 'none';
}

// Llenar datos del paciente desde la base de datos para perfil lipídico
function fillLipidPatientDataFromDatabase(patient) {
    // Buscar los datos del paciente en la base de datos seleccionada
    const patientData = selectedLipidDatabase.data.find(row => row.ID_Unico === patient.id);
    
    
    if (patientData) {
        // Llenar fecha de nacimiento - buscar diferentes variaciones de nombres
        const birthdateValue = patientData.fecha_nacimiento || patientData.Fecha_Nacimiento || patientData.FECHA_NACIMIENTO ||
                              patientData.birthdate || patientData.Birthdate || patientData.BIRTHDATE ||
                              patientData.fecha_nac || patientData.Fecha_Nac || patientData.FECHA_NAC;
        
        
        if (birthdateValue && birthdateValue !== '' && birthdateValue !== 'NaT' && birthdateValue.trim() !== '') {
            // Si es una fecha en formato string, convertirla
            let dateValue = birthdateValue;
            if (typeof dateValue === 'string' && dateValue.includes('/')) {
                // Convertir formato DD/MM/YYYY a YYYY-MM-DD
                const parts = dateValue.split('/');
                if (parts.length === 3) {
                    dateValue = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
            
            document.getElementById('lipidBirthdate').value = dateValue;
            
            // Calcular y mostrar la edad
            calculateLipidAge();
        } else {
            
            // Si el campo está vacío, dejar el campo para que el usuario ingrese la fecha
            const birthdateField = document.getElementById('lipidBirthdate');
            if (birthdateField) {
                birthdateField.value = '';
            }
        }
        
        // Llenar sexo - buscar diferentes variaciones de nombres
        const sexValue = patientData.sexo || patientData.Sexo || patientData.SEXO ||
                        patientData.genero || patientData.Genero || patientData.GENERO ||
                        patientData.gender || patientData.Gender || patientData.GENDER;
        
        
        if (sexValue && sexValue !== '' && sexValue !== 'NaT' && sexValue.trim() !== '') {
            const sexField = document.getElementById('lipidSex');
            if (sexField) {
                sexField.value = sexValue;
            } else {
            }
        } else {
            
            // Si el campo está vacío, dejar el campo para que el usuario seleccione
            const sexField = document.getElementById('lipidSex');
            if (sexField) {
                sexField.value = '';
            }
        }
    } else {
    }
}

// Mostrar información del paciente seleccionado
function displayLipidPatientInfo(patient) {
    const patientInfo = document.getElementById('lipidPatientInfo');
    patientInfo.innerHTML = `
        <div class="patient-selected">
            <h5><i class="fas fa-user-check"></i> Paciente Seleccionado</h5>
            <div class="patient-details">
                <p><strong>ID:</strong> ${patient.id}</p>
                <p><strong>Estado:</strong> ${patient.has_lipid_profile ? 'Perfil lipídico registrado' : 'Sin perfil lipídico'}</p>
                <p><strong>Base de datos:</strong> ${selectedLipidDatabase.filename}</p>
            </div>
        </div>
    `;
}

// Filtrar pacientes para perfil lipídico
window.filterLipidPatients = function() {
    const searchTerm = document.getElementById('lipidPatientSearch').value.toLowerCase();
    const patientItems = document.querySelectorAll('#lipidPatientList .patient-item');
    
    patientItems.forEach(item => {
        const patientText = item.textContent.toLowerCase();
        if (patientText.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
};

// Cambiar base de datos para perfil lipídico
window.changeLipidDatabase = function() {
    selectedLipidDatabase = null;
    selectedLipidPatient = null;
    
    document.getElementById('lipidPatientSelector').style.display = 'none';
    document.getElementById('lipidProfileForm').style.display = 'none';
    document.getElementById('lipidDatabaseSelector').style.display = 'block';
    
    loadLipidDatabases();
    
    // Recalcular el tamaño del expander después de volver al selector de base de datos
    setTimeout(() => {
        recalculateLipidExpanderHeight();
    }, 100);
};

// Descargar plantillas para perfil lipídico
window.downloadLipidTemplates = function() {
    if (!selectedLipidDatabase) {
        showToast('Primero selecciona una base de datos', 'error');
        return;
    }
    
    // Crear enlace de descarga
    const downloadUrl = `/api/lipid-profile/download-template/${selectedLipidDatabase.id}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `plantilla de Perfil Lipidico TODO.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Descargando plantilla PDF...', 'success');
};

// Función para calcular VLDL automáticamente
function calculateVLDL() {
    const triglycerides = parseFloat(document.getElementById('triglycerides').value);
    const vldlField = document.getElementById('vldlCholesterol');
    
    if (triglycerides && triglycerides > 0) {
        // VLDL = Triglicéridos / 5 (aproximación de Friedewald)
        const vldl = triglycerides / 5;
        vldlField.value = vldl.toFixed(1);
        
        // Recalcular otros valores que dependen de VLDL
        calculateLDLFromTotalAndHDL();
        calculateHDLFromTotalAndLDL();
        calculateNonHDL();
        updateLipidReferencePanel();
    } else {
        vldlField.value = '';
        // Limpiar campos calculados que dependen de VLDL
        clearCalculatedFields();
    }
}

// Función para calcular LDL cuando se tiene Colesterol Total y HDL
function calculateLDLFromTotalAndHDL() {
    const totalCholesterol = parseFloat(document.getElementById('totalCholesterol').value);
    const hdlCholesterol = parseFloat(document.getElementById('hdlCholesterol').value);
    const triglycerides = parseFloat(document.getElementById('triglycerides').value);
    const ldlField = document.getElementById('ldlCholesterol');
    
    if (totalCholesterol && hdlCholesterol && triglycerides) {
        // LDL = Colesterol Total - HDL - VLDL
        // VLDL = Triglicéridos / 5
        const vldl = triglycerides / 5;
        const ldl = totalCholesterol - hdlCholesterol - vldl;
        
        if (ldl >= 0) {
            ldlField.value = ldl.toFixed(1);
        } else {
            ldlField.value = '';
        }
        
        calculateNonHDL();
    }
}

// Función para calcular HDL cuando se tiene Colesterol Total y LDL
function calculateHDLFromTotalAndLDL() {
    const totalCholesterol = parseFloat(document.getElementById('totalCholesterol').value);
    const ldlCholesterol = parseFloat(document.getElementById('ldlCholesterol').value);
    const triglycerides = parseFloat(document.getElementById('triglycerides').value);
    const hdlField = document.getElementById('hdlCholesterol');
    
    if (totalCholesterol && ldlCholesterol && triglycerides) {
        // HDL = Colesterol Total - LDL - VLDL
        // VLDL = Triglicéridos / 5
        const vldl = triglycerides / 5;
        const hdl = totalCholesterol - ldlCholesterol - vldl;
        
        if (hdl >= 0) {
            hdlField.value = hdl.toFixed(1);
        } else {
            hdlField.value = '';
        }
        
        calculateNonHDL();
    }
}

// Función para calcular No-HDL
function calculateNonHDL() {
    const totalCholesterol = parseFloat(document.getElementById('totalCholesterol').value);
    const hdlCholesterol = parseFloat(document.getElementById('hdlCholesterol').value);
    const nonHdlField = document.getElementById('nonHdlCholesterol');
    
    if (totalCholesterol && hdlCholesterol) {
        // No-HDL = Colesterol Total - HDL
        const nonHdl = totalCholesterol - hdlCholesterol;
        nonHdlField.value = nonHdl.toFixed(1);
    } else {
        nonHdlField.value = '';
    }
}

// Función para limpiar campos calculados cuando se borra un valor base
function clearCalculatedFields() {
    document.getElementById('vldlCholesterol').value = '';
    document.getElementById('nonHdlCholesterol').value = '';
    updateLipidReferencePanel();
}

// Función para limpiar campos calculados cuando se borra LDL o HDL
function clearDependentFields() {
    document.getElementById('nonHdlCholesterol').value = '';
    updateLipidReferencePanel();
}

// Función para recalcular todos los valores cuando cambia el colesterol total
function recalculateAllFromTotal() {
    const totalCholesterol = parseFloat(document.getElementById('totalCholesterol').value);
    
    if (totalCholesterol) {
        // Si hay HDL, calcular LDL
        calculateLDLFromTotalAndHDL();
        // Si hay LDL, calcular HDL
        calculateHDLFromTotalAndLDL();
        // Calcular No-HDL
        calculateNonHDL();
        updateLipidReferencePanel();
    } else {
        clearCalculatedFields();
    }
}

// Función para recalcular cuando cambia HDL
function recalculateFromHDL() {
    const hdlCholesterol = parseFloat(document.getElementById('hdlCholesterol').value);
    
    if (hdlCholesterol) {
        calculateLDLFromTotalAndHDL();
        calculateNonHDL();
    } else {
        clearDependentFields();
    }
}

// Función para recalcular cuando cambia LDL
function recalculateFromLDL() {
    const ldlCholesterol = parseFloat(document.getElementById('ldlCholesterol').value);
    
    if (ldlCholesterol) {
        calculateHDLFromTotalAndLDL();
        calculateNonHDL();
    } else {
        clearDependentFields();
    }
}

// Función para recalcular cuando cambian los triglicéridos
function recalculateFromTriglycerides() {
    const triglycerides = parseFloat(document.getElementById('triglycerides').value);
    
    if (triglycerides) {
        calculateVLDL();
    } else {
        clearCalculatedFields();
    }
}

// Función para agregar event listeners a los campos del formulario de perfil lipídico
function addLipidCalculationListeners() {
    // Colesterol Total
    const totalCholesterolField = document.getElementById('totalCholesterol');
    if (totalCholesterolField) {
        totalCholesterolField.addEventListener('input', recalculateAllFromTotal);
        totalCholesterolField.addEventListener('blur', recalculateAllFromTotal);
        addLipidValidationListeners('totalCholesterol');
    }
    
    // HDL Colesterol
    const hdlCholesterolField = document.getElementById('hdlCholesterol');
    if (hdlCholesterolField) {
        hdlCholesterolField.addEventListener('input', recalculateFromHDL);
        hdlCholesterolField.addEventListener('blur', recalculateFromHDL);
        addLipidValidationListeners('hdlCholesterol');
    }
    
    // LDL Colesterol
    const ldlCholesterolField = document.getElementById('ldlCholesterol');
    if (ldlCholesterolField) {
        ldlCholesterolField.addEventListener('input', recalculateFromLDL);
        ldlCholesterolField.addEventListener('blur', recalculateFromLDL);
        addLipidValidationListeners('ldlCholesterol');
    }
    
    // Triglicéridos
    const triglyceridesField = document.getElementById('triglycerides');
    if (triglyceridesField) {
        triglyceridesField.addEventListener('input', recalculateFromTriglycerides);
        triglyceridesField.addEventListener('blur', recalculateFromTriglycerides);
        addLipidValidationListeners('triglycerides');
    }
    
    // Glucosa
    const glucoseField = document.getElementById('glucose');
    if (glucoseField) {
        addLipidValidationListeners('glucose');
        glucoseField.addEventListener('input', function() {
            validateLipidField('glucose');
            updateLipidReferencePanel();
        });
    }
}

// Función para agregar validaciones a campos del perfil lipídico
function addLipidValidationListeners(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    // Validación cuando se escribe
    field.addEventListener('input', function() {
        validateLipidField(fieldId);
    });
    
    // Validación cuando se pega texto
    field.addEventListener('paste', function(e) {
        setTimeout(() => {
            validateLipidField(fieldId);
        }, 10);
    });
    
    // Prevenir entrada de caracteres no numéricos
    field.addEventListener('keypress', function(e) {
        // Permitir teclas de control (backspace, delete, tab, etc.)
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        
        const char = String.fromCharCode(e.which);
        const currentValue = this.value;
        
        // Permitir solo números
        if (!/[0-9]/.test(char)) {
            // Permitir punto decimal solo si:
            // 1. No hay punto ya en el valor
            // 2. No es el primer carácter
            if (char === '.' && !currentValue.includes('.') && currentValue.length > 0) {
                return; // Permitir el punto
            }
            e.preventDefault();
        }
    });
}

// Limpiar formulario de perfil lipídico
window.resetLipidProfileForm = function() {
    // Limpiar campos de datos básicos
    document.getElementById('lipidBirthdate').value = '';
    document.getElementById('lipidAgeDisplay').value = '';
    document.getElementById('lipidSex').value = '';
    
    // Limpiar campos de perfil lipídico
    const lipidFields = ['totalCholesterol', 'hdlCholesterol', 'ldlCholesterol', 'triglycerides', 'vldlCholesterol', 'glucose', 'nonHdlCholesterol'];
    lipidFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = '';
            hideLipidFieldError(fieldId);
        }
    });
    
    // Limpiar campos calculados
    document.getElementById('cholesterolRatio').value = '';
    const cvEl = document.getElementById('cardiovascularRisk');
    if (cvEl) {
        cvEl.value = '';
        cvEl.className = '';
    }
    
    // Establecer fecha máxima para fecha de nacimiento
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('lipidBirthdate').max = today;
    updateLipidReferencePanel();
};

// Validar campo de perfil lipídico
function validateLipidField(fieldId) {
    const field = document.getElementById(fieldId);
    const value = field.value.trim();
    
    if (value === '') {
        hideLipidFieldError(fieldId);
        return true;
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
        showLipidFieldError(fieldId);
        return false;
    }
    
    hideLipidFieldError(fieldId);
    return true;
}

// Mostrar error en campo de perfil lipídico
function showLipidFieldError(fieldId) {
    const errorElement = document.getElementById(fieldId + 'Error');
    if (errorElement) {
        errorElement.style.display = 'block';
    }
}

// Ocultar error en campo de perfil lipídico
function hideLipidFieldError(fieldId) {
    const errorElement = document.getElementById(fieldId + 'Error');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

// Calcular edad automáticamente para perfil lipídico
document.addEventListener('DOMContentLoaded', function() {
    const lipidBirthdateField = document.getElementById('lipidBirthdate');
    if (lipidBirthdateField) {
        lipidBirthdateField.addEventListener('change', function() {
            calculateLipidAge();
        });
    }
    
    // Agregar validación en tiempo real para campos de perfil lipídico
    const lipidFields = ['totalCholesterol', 'hdlCholesterol', 'ldlCholesterol', 'triglycerides', 'nonHdlCholesterol'];
    lipidFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', function() {
                validateLipidField(fieldId);
                calculateLipidResults();
            });
        }
    });
});

// --- Perfil lipídico: edad y referencias clínicas (NHLBI pediátrico / ATP III adulto / ADA glucosa) ---

function getLipidPatientAgeMonths() {
    const birthEl = document.getElementById('lipidBirthdate');
    if (!birthEl || !birthEl.value) return null;
    const ai = calculateAgeInYearsAndMonths(birthEl.value, getTodayLocalISO());
    return ai ? ai.totalMonths : null;
}

function usesPediatricLipidThresholds(ageMonths) {
    if (ageMonths === null || ageMonths === undefined) return false;
    return ageMonths < 18 * 12;
}

function getPediatricTGCutoffs(ageMonths) {
    if (ageMonths === null || ageMonths === undefined) {
        return { acceptable: 90, borderline: 130, axis: 280 };
    }
    if (ageMonths < 10 * 12) {
        return { acceptable: 75, borderline: 100, axis: 220 };
    }
    return { acceptable: 90, borderline: 130, axis: 280 };
}

/**
 * Umbrales numéricos usados por las barras y por "+ Información" (una sola fuente de verdad).
 */
function getLipidActiveThresholdSnapshot(ageMonths) {
    const ped = usesPediatricLipidThresholds(ageMonths);
    const tg = ped ? getPediatricTGCutoffs(ageMonths) : { acceptable: 150, borderline: 200, axis: 400 };
    return {
        ped,
        ageMonths,
        tc: ped ? { acc: 170, bor: 200, axis: 280 } : { acc: 200, bor: 240, axis: 320 },
        ldl: ped ? { acc: 110, bor: 130, axis: 200 } : { acc: 100, bor: 130, axis: 220 },
        tg,
        nonHdl: ped ? { acc: 120, bor: 145, axis: 220 } : { acc: 130, bor: 160, axis: 240 },
        hdl: { low: 40, optimal: 60, axis: 100 },
        vldl: { acc: 25, bor: 40, axis: 80 },
        glucose: { normal: 100, ifg: 126, axis: 220 },
        ratio: ped ? { good: 3.5, border: 4.5, axis: 7 } : { good: 4, border: 5, axis: 8 }
    };
}

function escapeHtmlLipidRef(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Contenido del modal «+ Información»: fuentes oficiales (México) y criterios alineados al código.
 */
function buildLipidReferenceInfoModalBodyHtml(ageM) {
    const s = getLipidActiveThresholdSnapshot(ageM);
    const ped = s.ped;
    const ageTxt = ageM === null
        ? 'No hay fecha de nacimiento: en esta herramienta se aplican por defecto los cortes de adulto (≥18 años) para lípidos y los mismos criterios de glucosa en ayunas.'
        : (ped
            ? `Edad calculada: menor de 18 años (${Math.floor(ageM / 12)} años aprox.). Se aplican cortes pediátricos NHLBI 2011 para lípidos (salvo donde se indica alineación con NOM mexicana).`
            : 'Edad calculada: 18 años o más. Se aplican cortes de adulto tipo ATP III para lípidos y criterios de glucosa en ayunas alineados con NOM-015 / ADA.');

    const tgBand = ped
        ? (ageM !== null && ageM < 10 * 12
            ? `Aceptable &lt;${s.tg.acceptable}; límite ${s.tg.acceptable}–99; alto ≥100 mg/dL (ayunas).`
            : `Aceptable &lt;${s.tg.acceptable}; límite ${s.tg.acceptable}–129; alto ≥130 mg/dL (ayunas).`)
        : `Normal &lt;${s.tg.acceptable}; límite ${s.tg.acceptable}–199; alto ≥${s.tg.borderline} mg/dL (ayunas).`;

    const rows = [
        `<tr><td>Colesterol total</td><td>${ped ? `Aceptable &lt;${s.tc.acc}; límite ${s.tc.acc}–${s.tc.bor - 1}; alto ≥${s.tc.bor}` : `Deseable &lt;${s.tc.acc}; límite ${s.tc.acc}–${s.tc.bor - 1}; muy alto ≥${s.tc.bor}`} mg/dL</td><td>${ped ? 'NHLBI Ped. 2011' : 'ATP III; coherente con control &lt;200 en NOM-037'}</td></tr>`,
        `<tr><td>LDL</td><td>${ped ? `Aceptable &lt;${s.ldl.acc}; límite ${s.ldl.acc}–${s.ldl.bor - 1}; alto ≥${s.ldl.bor}` : `Óptimo &lt;${s.ldl.acc}; límite ${s.ldl.acc}–${s.ldl.bor - 1}; alto ≥${s.ldl.bor}`} mg/dL</td><td>${ped ? 'NHLBI Ped. 2011' : 'ATP III; NOM-037 remite a apéndices y metas por riesgo'}</td></tr>`,
        `<tr><td>HDL</td><td>Bajo &lt;${s.hdl.low}; aceptable ${s.hdl.low}–${s.hdl.optimal - 1}; óptimo ≥${s.hdl.optimal} mg/dL (mayor es mejor)</td><td>ATP III / NHLBI; NOM-037 (caso probable si &lt;40)</td></tr>`,
        `<tr><td>Triglicéridos</td><td>${tgBand}</td><td>${ped ? 'NHLBI Ped. 2011' : 'ATP III; NOM-037 (caso probable si ≥150)'}</td></tr>`,
        `<tr><td>No-HDL</td><td>${ped ? `Aceptable &lt;${s.nonHdl.acc}; límite ${s.nonHdl.acc}–${s.nonHdl.bor - 1}; alto ≥${s.nonHdl.bor}` : `Objetivo &lt;${s.nonHdl.acc}; límite ${s.nonHdl.acc}–${s.nonHdl.bor - 1}; alto ≥${s.nonHdl.bor}`} mg/dL</td><td>${ped ? 'NHLBI Ped. 2011' : 'Objetivos frecuentes en adulto; NOM-037 metas por riesgo'}</td></tr>`,
        `<tr><td>VLDL (TG/5)</td><td>Orientativa: favorable &lt;${s.vldl.acc}; límite ${s.vldl.acc}–${s.vldl.bor - 1}; elevada ≥${s.vldl.bor} mg/dL</td><td>Friedewald; referencia práctica no normativa única en NOM</td></tr>`,
        `<tr><td>Glucosa ayunas</td><td>Normal &lt;${s.glucose.normal}; prediabetes / GAA ${s.glucose.normal}–${s.glucose.ifg - 1}; ≥${s.glucose.ifg} mg/dL requiere confirmación</td><td>NOM-015-SSA2-2010 (GAA, DM); criterios compatibles ADA</td></tr>`,
        `<tr><td>CT/HDL</td><td>${ped ? `Deseable &lt;${s.ratio.good}; límite &lt;${s.ratio.border}; elevado ≥${s.ratio.border}` : `Deseable &lt;${s.ratio.good}; límite &lt;${s.ratio.border}; elevado ≥${s.ratio.border}`}</td><td>Índice clásico de riesgo; orientación bibliográfica</td></tr>`
    ].join('');

    return `<div class="lipid-ref-modal-body">
        <p class="lipid-ref-details-intro">${escapeHtmlLipidRef(ageTxt)}</p>
        <h6 class="lipid-ref-details-h">Documentos oficiales — México</h6>
        <ul class="lipid-ref-details-ul">
            <li><strong>NOM-037-SSA2-2012</strong>, prevención, tratamiento y control de las dislipidemias (Secretaría de Salud). Define el marco nacional, detección en adultos a partir de los 20 años, criterios de caso probable (p. ej. colesterol total ≥200 mg/dL, triglicéridos ≥150 mg/dL y/o C-HDL &lt;40 mg/dL en detección) y remite a apéndices para metas según riesgo. Texto en el Diario Oficial de la Federación:
                <a href="https://www.dof.gob.mx/normasOficiales/4802/salud/salud.html" target="_blank" rel="noopener noreferrer">dof.gob.mx/normasOficiales/4802/salud/salud.html</a>
            </li>
            <li><strong>NOM-015-SSA2-2010</strong>, prevención, tratamiento y control de la diabetes mellitus. Define <em>glucosa anormal en ayuno (GAA)</em> entre 100 y 125 mg/dL y criterios de diabetes en ayunas ≥126 mg/dL (con confirmación según la propia norma). Publicación DOF:
                <a href="https://www.dof.gob.mx/normasOficiales/4215/salud/salud.htm" target="_blank" rel="noopener noreferrer">dof.gob.mx/normasOficiales/4215/salud/salud.htm</a>
            </li>
            <li><strong>Guías de práctica clínica (México)</strong>, p. ej. <strong>GPC-IMSS-233</strong> «Tratamiento de dislipidemias en el adulto» (CENETEC / IMSS, 2022), como referencia nacional de evidencia para el adulto:
                <a href="https://www.cenetec-difusion.com/CMGPC/GPC-IMSS-233-22/ER.pdf" target="_blank" rel="noopener noreferrer">cenetec-difusion.com/CMGPC/GPC-IMSS-233-22/ER.pdf</a>
            </li>
        </ul>
        <p class="lipid-ref-details-note">La población del estudio es mexicana; los criterios mexicanos anteriores son los de mayor jerarquía normativa en el país. Los cortes <strong>pediátricos por edad</strong> de colesterol, LDL, triglicéridos y no-HDL en esta pantalla siguen el <strong>Informe del Grupo Experto integrado de NHLBI (2011)</strong>, adoptado internacionalmente y referenciado en la bibliografía de la NOM-037.</p>
        <h6 class="lipid-ref-details-h">Referencias internacionales aplicadas en el algoritmo</h6>
        <ul class="lipid-ref-details-ul">
            <li><strong>NHLBI</strong>, «Expert Panel on Integrated Guidelines for Cardiovascular Health and Risk Reduction in Children and Adolescents» (2011): clasificación lipídica en ayunas por edades (incl. TG &lt;75 mg/dL en 0–9 años y &lt;90 mg/dL en 10–17 años, y cortes de CT/LDL/no-HDL).</li>
            <li><strong>ATP III</strong> (NCEP, adultos): puntos de corte habituales para CT, LDL, HDL y TG en ayunas.</li>
            <li><strong>ADA</strong>: criterios de glucosa en ayunas compatibles con la definición de GAA en México (100–125 mg/dL) y umbral de 126 mg/dL para sospecha de diabetes, siempre sujeto a confirmación clínica y normativa local.</li>
        </ul>
        <h6 class="lipid-ref-details-h">Valores numéricos exactos usados en esta vista (sincronizados con las barras)</h6>
        <div class="lipid-ref-table-wrap">
            <table class="lipid-ref-table">
                <thead><tr><th>Parámetro</th><th>Umbrales en esta herramienta</th><th>Etiqueta de fuente</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="lipid-ref-details-legal">Esta tabla reproduce los mismos números que el motor de colores de las barras. Cualquier decisión clínica o de salud pública debe ceñirse a la normativa y guías institucionales vigentes y al contexto del paciente (ayuno real, medicación, embarazo, etc.).</p>
    </div>`;
}

function getLipidReferenceInfoButtonHtml() {
    return `<div class="lipid-ref-info-actions">
        <button type="button" class="btn btn-secondary" onclick="openLipidReferenceInfoModal()">
            <i class="fas fa-book-medical"></i> + Información…
        </button>
    </div>`;
}

let lipidReferenceInfoModalEscapeHandler = null;

window.openLipidReferenceInfoModal = function () {
    const modal = document.getElementById('lipidReferenceInfoModal');
    const bodyEl = document.getElementById('lipidReferenceInfoModalBody');
    if (!modal || !bodyEl) return;
    const ageM = window.__lipidRefInfoModalAgeMonths;
    bodyEl.innerHTML = buildLipidReferenceInfoModalBodyHtml(ageM);
    modal.style.display = 'flex';
    if (!lipidReferenceInfoModalEscapeHandler) {
        lipidReferenceInfoModalEscapeHandler = function (ev) {
            if (ev.key === 'Escape') {
                window.closeLipidReferenceInfoModal();
            }
        };
    }
    document.removeEventListener('keydown', lipidReferenceInfoModalEscapeHandler);
    document.addEventListener('keydown', lipidReferenceInfoModalEscapeHandler);
};

window.closeLipidReferenceInfoModal = function () {
    const modal = document.getElementById('lipidReferenceInfoModal');
    if (modal) modal.style.display = 'none';
    if (lipidReferenceInfoModalEscapeHandler) {
        document.removeEventListener('keydown', lipidReferenceInfoModalEscapeHandler);
    }
};

function classifyHigherWorse(value, acceptableMax, borderlineMax) {
    if (!isFinite(value) || value < 0) return { key: 'neutral', label: 'Sin dato' };
    if (value < acceptableMax) return { key: 'normal', label: 'Aceptable / óptimo' };
    if (value < borderlineMax) return { key: 'borderline', label: 'Límite o moderado' };
    return { key: 'high', label: 'Elevado' };
}

function classifyHDL(value, lowMax = 40, optimalMin = 60) {
    if (!isFinite(value) || value <= 0) return { key: 'neutral', label: 'Sin dato' };
    if (value < lowMax) return { key: 'low', label: 'Bajo (factor de riesgo)' };
    if (value < optimalMin) return { key: 'borderline', label: 'Aceptable' };
    return { key: 'optimal', label: 'Óptimo (protector)' };
}

function classifyRatioLowerBetter(value, goodMax, borderMax) {
    if (!isFinite(value) || value <= 0) return { key: 'neutral', label: 'Sin dato' };
    if (value < goodMax) return { key: 'normal', label: 'Deseable' };
    if (value < borderMax) return { key: 'borderline', label: 'Límite' };
    return { key: 'high', label: 'Elevado' };
}

function classifyGlucoseFasting(value, normalMax, ifgMax) {
    if (!isFinite(value) || value < 0) return { key: 'neutral', label: 'Sin dato' };
    if (value < normalMax) return { key: 'normal', label: 'Normal (ayunas)' };
    if (value < ifgMax) return { key: 'borderline', label: 'Prediabetes / alterado en ayunas' };
    return { key: 'high', label: 'Posible diabetes (confirmar clínicamente)' };
}

function pillClassFromStatus(statusKey) {
    if (statusKey === 'normal' || statusKey === 'optimal') {
        return 'lipid-ref-value-pill lipid-ref-value-pill--normal';
    }
    if (statusKey === 'borderline') {
        return 'lipid-ref-value-pill lipid-ref-value-pill--borderline';
    }
    if (statusKey === 'high' || statusKey === 'low') {
        return 'lipid-ref-value-pill lipid-ref-value-pill--alert';
    }
    return 'lipid-ref-value-pill lipid-ref-value-pill--neutral';
}

function renderHigherWorseBar(value, axisMax, tAccept, tBorder) {
    const v = Math.max(0, value);
    const axis = Math.max(axisMax, v * 1.05, 1);
    const w1 = (tAccept / axis) * 100;
    const w2 = ((tBorder - tAccept) / axis) * 100;
    const w3 = Math.max(0, 100 - w1 - w2);
    const marker = Math.min(100, Math.max(0, (v / axis) * 100));
    return `
        <div class="lipid-ref-track">
            <div class="lipid-ref-zone lipid-ref-zone--good" style="width:${w1}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--warn" style="width:${w2}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--bad" style="width:${w3}%"></div>
            <div class="lipid-ref-marker" style="left:${marker}%"></div>
        </div>
        <div class="lipid-ref-scale"><span>0</span><span>${tAccept}</span><span>${tBorder}</span><span>${Math.round(axis)}</span></div>`;
}

function renderHDLBar(value, axisMax, lowThreshold = 40, optimalThreshold = 60) {
    const v = Math.max(0, value);
    const axis = Math.max(axisMax, v * 1.05, 1);
    const midSpan = Math.max(0.0001, optimalThreshold - lowThreshold);
    const wLow = (lowThreshold / axis) * 100;
    const wMid = (midSpan / axis) * 100;
    const wHigh = Math.max(0, 100 - wLow - wMid);
    const marker = Math.min(100, Math.max(0, (v / axis) * 100));
    return `
        <div class="lipid-ref-track">
            <div class="lipid-ref-zone lipid-ref-zone--bad-inv" style="width:${wLow}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--warn-inv" style="width:${wMid}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--good-inv" style="width:${wHigh}%"></div>
            <div class="lipid-ref-marker" style="left:${marker}%"></div>
        </div>
        <div class="lipid-ref-scale"><span>0</span><span>${lowThreshold}</span><span>${optimalThreshold}</span><span>${Math.round(axis)}</span></div>`;
}

function renderRatioBarLowerBetter(value, axisMax, goodMax, borderMax) {
    const v = Math.max(0, value);
    const axis = Math.max(axisMax, v * 1.05, 1);
    const w1 = (goodMax / axis) * 100;
    const w2 = ((borderMax - goodMax) / axis) * 100;
    const w3 = Math.max(0, 100 - w1 - w2);
    const marker = Math.min(100, Math.max(0, (v / axis) * 100));
    return `
        <div class="lipid-ref-track">
            <div class="lipid-ref-zone lipid-ref-zone--good" style="width:${w1}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--warn" style="width:${w2}%"></div>
            <div class="lipid-ref-zone lipid-ref-zone--bad" style="width:${w3}%"></div>
            <div class="lipid-ref-marker" style="left:${marker}%"></div>
        </div>
        <div class="lipid-ref-scale"><span>0</span><span>${goodMax}</span><span>${borderMax}</span><span>${axis.toFixed(1)}</span></div>`;
}

/**
 * Bloque HTML de tarjetas de referencia lipídica + conclusión (misma lógica que el panel del formulario).
 * @param {number|null} ageM meses de edad (misma regla que getLipidPatientAgeMonths)
 * @param {{ tc:number,hdl:number,ldl:number,tg:number,vldl:number,glu:number,nonHdl:number,ratio:number }} vals NaN si no aplica
 * @param {{ includeInfoButton?: boolean, appendRiskNote?: boolean }} opts
 */
function buildLipidReferenceVisualBlockHtml(ageM, vals, opts) {
    const o = opts || {};
    const includeInfoButton = o.includeInfoButton !== false;
    const appendRiskNote = o.appendRiskNote !== false;
    const tc = vals.tc;
    const hdl = vals.hdl;
    const ldl = vals.ldl;
    const tg = vals.tg;
    const vldl = vals.vldl;
    const glu = vals.glu;
    const nonHdl = vals.nonHdl;
    const ratio = vals.ratio;

    const ped = usesPediatricLipidThresholds(ageM);
    const ageLabel = ageM === null
        ? 'Sin fecha de nacimiento: se usan criterios de adulto como referencia conservadora.'
        : (ped ? `Población pediátrica (menores de 18 años; aprox. ${Math.floor(ageM / 12)} años).` : 'Adulto (18 años o más).');

    const s = getLipidActiveThresholdSnapshot(ageM);
    let cardsHtml = '';
    const scores = [];

    if (isFinite(tc) && tc > 0) {
        const acc = s.tc.acc;
        const bor = s.tc.bor;
        const axis = s.tc.axis;
        const cl = classifyHigherWorse(tc, acc, bor);
        scores.push(cl.key);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Colesterol total</p>
                <span class="${pillClassFromStatus(cl.key)}">${tc.toFixed(1)} mg/dL</span>
            </div>
            <p class="lipid-ref-ranges">${ped ? 'Aceptable &lt;' + acc + ', límite ' + acc + '–' + (bor - 1) + ', alto ≥' + bor + ' mg/dL (NHLBI).' : 'Deseable &lt;' + acc + ', límite alto ' + acc + '–' + (bor - 1) + ', muy alto ≥' + bor + ' mg/dL (ATP III).'}</p>
            ${renderHigherWorseBar(tc, axis, acc, bor)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    if (isFinite(ldl) && ldl > 0) {
        const acc = s.ldl.acc;
        const bor = s.ldl.bor;
        const axis = s.ldl.axis;
        const cl = classifyHigherWorse(ldl, acc, bor);
        scores.push(cl.key);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">LDL colesterol</p>
                <span class="${pillClassFromStatus(cl.key)}">${ldl.toFixed(1)} mg/dL</span>
            </div>
            <p class="lipid-ref-ranges">${ped ? 'Aceptable &lt;110, límite 110–129, alto ≥130 mg/dL (NHLBI).' : 'Óptimo &lt;100, límite 100–129, alto ≥130 mg/dL (ATP III orientativo).'}</p>
            ${renderHigherWorseBar(ldl, axis, acc, bor)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    if (isFinite(hdl) && hdl > 0) {
        const cl = classifyHDL(hdl, s.hdl.low, s.hdl.optimal);
        const sk = cl.key === 'optimal' ? 'normal' : (cl.key === 'low' ? 'high' : 'borderline');
        scores.push(sk);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">HDL colesterol</p>
                <span class="${pillClassFromStatus(cl.key === 'low' ? 'high' : cl.key === 'optimal' ? 'normal' : 'borderline')}">${hdl.toFixed(1)} mg/dL</span>
            </div>
            <p class="lipid-ref-ranges">Mayor es mejor. Bajo &lt;${s.hdl.low} (riesgo), aceptable ${s.hdl.low}–${s.hdl.optimal - 1}, óptimo ≥${s.hdl.optimal} mg/dL (ATP III / NHLBI; NOM-037 caso probable si &lt;40).</p>
            ${renderHDLBar(hdl, s.hdl.axis, s.hdl.low, s.hdl.optimal)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    if (isFinite(tg) && tg > 0) {
        const acc = s.tg.acceptable;
        const bor = s.tg.borderline;
        const axis = s.tg.axis;
        let legend;
        if (ped) {
            legend = ageM !== null && ageM < 10 * 12
                ? 'Pediátrico 2–9 años: aceptable &lt;75, límite 75–99, alto ≥100 mg/dL (ayunas, NHLBI).'
                : 'Pediátrico 10–17 años: aceptable &lt;90, límite 90–129, alto ≥130 mg/dL (ayunas, NHLBI).';
        } else {
            legend = 'Adulto: normal &lt;150, límite 150–199, alto ≥200 mg/dL (ayunas, ATP III).';
        }
        const cl = classifyHigherWorse(tg, acc, bor);
        scores.push(cl.key);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Triglicéridos</p>
                <span class="${pillClassFromStatus(cl.key)}">${tg.toFixed(1)} mg/dL</span>
            </div>
            <p class="lipid-ref-ranges">${legend}</p>
            ${renderHigherWorseBar(tg, axis, acc, bor)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    if (isFinite(nonHdl) && nonHdl > 0) {
        const acc = s.nonHdl.acc;
        const bor = s.nonHdl.bor;
        const axis = s.nonHdl.axis;
        const cl = classifyHigherWorse(nonHdl, acc, bor);
        scores.push(cl.key);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">No-HDL colesterol</p>
                <span class="${pillClassFromStatus(cl.key)}">${nonHdl.toFixed(1)} mg/dL</span>
            </div>
            <p class="lipid-ref-ranges">${ped ? 'Aceptable &lt;120, límite 120–144, alto ≥145 mg/dL (NHLBI).' : 'Objetivo habitual &lt;130, límite 130–159, alto ≥160 mg/dL (orientación clínica adultos).'}</p>
            ${renderHigherWorseBar(nonHdl, axis, acc, bor)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    if (isFinite(vldl) && vldl > 0) {
        const acc = s.vldl.acc;
        const bor = s.vldl.bor;
        const axis = s.vldl.axis;
        const cl = classifyHigherWorse(vldl, acc, bor);
        scores.push(cl.key);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">VLDL (estimada TG/5)</p>
                <span class="${pillClassFromStatus(cl.key)}">${vldl.toFixed(1)} mg/dL</span>
            </div>
            <p class="lipid-ref-ranges">Referencia orientativa frecuente en práctica clínica: &lt;25 favorable, 25–39 límite, ≥40 elevada (derivada de triglicéridos).</p>
            ${renderHigherWorseBar(vldl, axis, acc, bor)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    if (isFinite(glu) && glu > 0) {
        const cl = classifyGlucoseFasting(glu, s.glucose.normal, s.glucose.ifg);
        const sk = cl.key === 'normal' ? 'normal' : (cl.key === 'borderline' ? 'borderline' : 'high');
        scores.push(sk);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Glucosa (ayunas)</p>
                <span class="${pillClassFromStatus(sk)}">${glu.toFixed(1)} mg/dL</span>
            </div>
            <p class="lipid-ref-ranges">NOM-015 / ADA (plasma en ayunas): normal &lt;100, GAA/prediabetes 100–125, ≥126 mg/dL requiere confirmación clínica.</p>
            ${renderHigherWorseBar(glu, s.glucose.axis, s.glucose.normal, s.glucose.ifg)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    if (isFinite(ratio) && ratio > 0) {
        const good = s.ratio.good;
        const bor = s.ratio.border;
        const axis = s.ratio.axis;
        const cl = classifyRatioLowerBetter(ratio, good, bor);
        scores.push(cl.key);
        cardsHtml += `<div class="lipid-ref-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">Relación CT/HDL</p>
                <span class="${pillClassFromStatus(cl.key)}">${ratio.toFixed(2)}</span>
            </div>
            <p class="lipid-ref-ranges">${ped ? 'Orientación pediátrica frecuente: deseable &lt;3.5, límite hasta &lt;4.5, mayor riesgo si ≥4.5.' : 'Orientación adultos: deseable &lt;4, límite &lt;5, elevado ≥5 (literatura clásica).'}</p>
            ${renderRatioBarLowerBetter(ratio, axis, good, bor)}
            <p class="lipid-ref-ranges" style="margin-top:6px"><strong>Estado:</strong> ${cl.label}</p>
        </div>`;
    }

    const abnormal = scores.filter(x => x === 'high' || x === 'low').length;
    const border = scores.filter(x => x === 'borderline').length;

    let concClass = 'lipid-ref-conclusion lipid-ref-conclusion--ok';
    let concText = '';
    if (abnormal > 0) {
        concClass = 'lipid-ref-conclusion lipid-ref-conclusion--alert';
        concText = `Se identifican ${abnormal} parámetro(s) fuera del rango deseable según la referencia aplicada. Se recomienda correlación clínica y seguimiento. `;
    } else if (border > 0) {
        concClass = 'lipid-ref-conclusion lipid-ref-conclusion--mixed';
        concText = `Hay ${border} parámetro(s) en zona límite; conviene vigilancia y hábitos (alimentación, actividad física). `;
    } else if (scores.length > 0) {
        concText = 'Los indicadores evaluados se sitúan en rangos deseables según los criterios de referencia seleccionados. ';
    }
    if (appendRiskNote) {
        concText += 'El resumen de riesgo cardiovascular en “Resultados calculados” es complementario.';
    }

    const tail = includeInfoButton ? getLipidReferenceInfoButtonHtml() : '';
    return `<p class="lipid-ref-ranges" style="margin-bottom:10px"><strong>Criterios aplicados:</strong> ${ageLabel}</p>${cardsHtml}<div class="${concClass}"><strong>Conclusión:</strong> ${concText}</div>${tail}`;
}

function updateLipidReferencePanel() {
    const panel = document.getElementById('lipidReferencePanel');
    if (!panel) return;

    const vals = {
        tc: parseFloat(document.getElementById('totalCholesterol')?.value),
        hdl: parseFloat(document.getElementById('hdlCholesterol')?.value),
        ldl: parseFloat(document.getElementById('ldlCholesterol')?.value),
        tg: parseFloat(document.getElementById('triglycerides')?.value),
        vldl: parseFloat(document.getElementById('vldlCholesterol')?.value),
        glu: parseFloat(document.getElementById('glucose')?.value),
        nonHdl: parseFloat(document.getElementById('nonHdlCholesterol')?.value),
        ratio: parseFloat(document.getElementById('cholesterolRatio')?.value)
    };

    const ageM = getLipidPatientAgeMonths();
    window.__lipidRefInfoModalAgeMonths = ageM;
    const lipidInfoBtnHtml = getLipidReferenceInfoButtonHtml();

    const hasAny = [vals.tc, vals.hdl, vals.ldl, vals.tg, vals.glu, vals.nonHdl, vals.vldl, vals.ratio].some(x => isFinite(x) && x > 0);
    if (!hasAny) {
        panel.innerHTML = '<p class="lipid-ref-empty">Ingrese valores numéricos para ver la comparación con rangos de referencia.</p>' + lipidInfoBtnHtml;
        requestAnimationFrame(() => {
            recalculateLipidExpanderHeight();
        });
        return;
    }

    panel.innerHTML = buildLipidReferenceVisualBlockHtml(ageM, vals, { includeInfoButton: true, appendRiskNote: true });

    requestAnimationFrame(() => {
        recalculateLipidExpanderHeight();
    });
}

// Calcular edad para perfil lipídico
function calculateLipidAge() {
    const birthdate = document.getElementById('lipidBirthdate').value;
    const ageDisplay = document.getElementById('lipidAgeDisplay');
    
    if (birthdate) {
        const birth = new Date(birthdate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        ageDisplay.value = `${age} años`;
    } else {
        ageDisplay.value = '';
    }
    updateLipidReferencePanel();
}

// Calcular resultados del perfil lipídico
function calculateLipidResults() {
    const totalCholesterol = parseFloat(document.getElementById('totalCholesterol').value) || 0;
    const hdlCholesterol = parseFloat(document.getElementById('hdlCholesterol').value) || 0;
    const ldlCholesterol = parseFloat(document.getElementById('ldlCholesterol').value) || 0;
    const triglycerides = parseFloat(document.getElementById('triglycerides').value) || 0;
    
    // Calcular relación colesterol total/HDL
    if (hdlCholesterol > 0) {
        const ratio = (totalCholesterol / hdlCholesterol).toFixed(2);
        document.getElementById('cholesterolRatio').value = ratio;
    } else {
        document.getElementById('cholesterolRatio').value = '';
    }
    
    // Calcular No-HDL colesterol
    if (totalCholesterol > 0 && hdlCholesterol > 0) {
        const nonHdl = (totalCholesterol - hdlCholesterol).toFixed(1);
        document.getElementById('nonHdlCholesterol').value = nonHdl;
    }
    
    const nonHdlNum = parseFloat(document.getElementById('nonHdlCholesterol')?.value);
    evaluateCardiovascularRiskFromNonHdl(nonHdlNum);
    updateLipidReferencePanel();
}

/**
 * Texto de categoría de riesgo según No-HDL (mg/dL), misma tabla que el modal «+ Información» junto a No-HDL.
 * Ver docstring previo (NCEP ATP III / NOM-037) en el historial de implementación.
 */
function getCardiovascularRiskLabelFromNonHdl(nonHdlMgDl) {
    if (!isFinite(nonHdlMgDl) || nonHdlMgDl < 0) return '';
    if (nonHdlMgDl < 100) return 'Óptimo — Riesgo cardiovascular muy bajo';
    if (nonHdlMgDl < 130) return 'Casi óptimo — Riesgo cardiovascular bajo';
    if (nonHdlMgDl < 160) return 'Límite alto — Riesgo cardiovascular moderado';
    if (nonHdlMgDl < 190) return 'Alto — Riesgo cardiovascular alto';
    return 'Muy alto — Riesgo cardiovascular muy alto';
}

function getCardiovascularRiskClassFromNonHdl(nonHdlMgDl) {
    if (!isFinite(nonHdlMgDl) || nonHdlMgDl < 0) return '';
    if (nonHdlMgDl < 130) return 'text-success';
    if (nonHdlMgDl < 160) return 'text-warning';
    return 'text-danger';
}

/**
 * Riesgo cardiovascular (texto del campo): según No-HDL (mg/dL), misma tabla que el modal «+ Información» junto a No-HDL.
 */
function evaluateCardiovascularRiskFromNonHdl(nonHdlMgDl) {
    const riskElement = document.getElementById('cardiovascularRisk');
    if (!riskElement) return;
    
    const text = getCardiovascularRiskLabelFromNonHdl(nonHdlMgDl);
    if (!text) {
        riskElement.value = '';
        riskElement.className = '';
        return;
    }
    riskElement.value = text;
    riskElement.className = getCardiovascularRiskClassFromNonHdl(nonHdlMgDl);
}

// Función para editar perfil lipídico de un paciente
async function editLipidPatient(patient) {
    
    try {
        // Obtener datos del paciente desde el backend
        const url = `/get-patient-lipid-profile/${selectedLipidDatabase.id}/${patient.id}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error del servidor:', errorText);
            showToast(`Error cargando datos del paciente: ${response.status} ${response.statusText}`, 'error');
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Establecer el paciente seleccionado
            selectedLipidPatient = patient;
            
            // Ocultar selector de pacientes y mostrar formulario
            document.getElementById('lipidPatientSelector').style.display = 'none';
            document.getElementById('lipidProfileForm').style.display = 'block';
            
            // Mostrar información del paciente
            displayLipidPatientInfo(patient);
            
            // Cargar datos existentes en el formulario
            loadLipidProfileData(result.lipid_data, result.patient_info);
            
            // Agregar event listeners para cálculos automáticos
            addLipidCalculationListeners();
            
            // Recalcular el tamaño del expander después de mostrar el formulario
            setTimeout(() => {
                recalculateLipidExpanderHeight();
            }, 100);
            
            showToast('Datos del paciente cargados para edición', 'success');
        } else {
            console.error('Error en la respuesta:', result);
            showToast('Error cargando datos del paciente', 'error');
        }
        
    } catch (error) {
        console.error('Error editando perfil lipídico:', error);
        showToast(`Error cargando datos del paciente: ${error.message}`, 'error');
    }
}

// Función para cargar datos existentes en el formulario
function loadLipidProfileData(lipidData, patientInfo) {
    // Cargar datos básicos del paciente
    if (patientInfo.birthdate) {
        document.getElementById('lipidBirthdate').value = patientInfo.birthdate;
        calculateLipidAge();
    }
    
    if (patientInfo.sex) {
        document.getElementById('lipidSex').value = patientInfo.sex;
    }
    
    // Cargar datos del perfil lipídico
    const fields = {
        'totalCholesterol': lipidData.totalCholesterol,
        'hdlCholesterol': lipidData.hdlCholesterol,
        'ldlCholesterol': lipidData.ldlCholesterol,
        'triglycerides': lipidData.triglycerides,
        'vldlCholesterol': lipidData.vldlCholesterol,
        'glucose': lipidData.glucose,
        'nonHdlCholesterol': lipidData.nonHdlCholesterol
    };
    
    Object.entries(fields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null) {
            field.value = value;
        }
    });
    
    // Recalcular valores derivados
    calculateLipidResults();
}

// Seleccionar otro paciente para perfil lipídico
window.selectAnotherLipidPatient = function() {
    selectedLipidPatient = null;
    
    document.getElementById('lipidProfileForm').style.display = 'none';
    document.getElementById('lipidPatientSelector').style.display = 'block';
    
    // Limpiar búsqueda
    document.getElementById('lipidPatientSearch').value = '';
    
    // Regenerar la lista completa de pacientes
    displayLipidPatients(allLipidPatients);
    
    // Recalcular el tamaño del expander después de volver al selector
    setTimeout(() => {
        recalculateLipidExpanderHeight();
    }, 100);
};

// Guardar datos del perfil lipídico
window.saveLipidProfileData = async function() {
    if (!selectedLipidDatabase || !selectedLipidPatient) {
        showToast('Error: No se ha seleccionado paciente o base de datos', 'error');
        return;
    }
    
    // Validar campos requeridos
    const totalCholesterol = document.getElementById('totalCholesterol').value;
    const triglycerides = document.getElementById('triglycerides').value;
    const glucose = document.getElementById('glucose').value;
    
    if (!totalCholesterol || !triglycerides || !glucose) {
        showToast('Colesterol Total, Triglicéridos y Glucosa son campos requeridos', 'error');
        return;
    }
    
    // Validar que todos los campos sean números positivos
    const lipidFields = ['totalCholesterol', 'hdlCholesterol', 'ldlCholesterol', 'triglycerides', 'vldlCholesterol', 'glucose', 'nonHdlCholesterol'];
    let hasErrors = false;
    
    lipidFields.forEach(fieldId => {
        if (!validateLipidField(fieldId)) {
            hasErrors = true;
        }
    });
    
    if (hasErrors) {
        showToast('Por favor corrige los errores en los campos', 'error');
        return;
    }
    
    try {
        // Preparar datos para enviar
        const lipidData = {
            totalCholesterol: parseFloat(totalCholesterol),
            hdlCholesterol: parseFloat(document.getElementById('hdlCholesterol').value) || null,
            ldlCholesterol: parseFloat(document.getElementById('ldlCholesterol').value) || null,
            triglycerides: parseFloat(document.getElementById('triglycerides').value) || null,
            vldlCholesterol: parseFloat(document.getElementById('vldlCholesterol').value) || null,
            glucose: parseFloat(document.getElementById('glucose').value) || null,
            nonHdlCholesterol: parseFloat(document.getElementById('nonHdlCholesterol').value) || null,
            cholesterolRatio: document.getElementById('cholesterolRatio').value || null,
            cardiovascularRisk: document.getElementById('cardiovascularRisk').value || null
        };
        
        const requestData = {
            database_id: selectedLipidDatabase.id,
            patient_id: selectedLipidPatient.id,
            lipid_data: lipidData
        };
        
        
        const response = await fetch('/api/lipid-profile/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showLipidConfirmationModal(result);
        } else {
            showToast(result.message || 'Error guardando perfil lipídico', 'error');
        }
        
    } catch (error) {
        console.error('Error guardando perfil lipídico:', error);
        showToast('Error guardando perfil lipídico', 'error');
    }
};

// Mostrar modal de confirmación para perfil lipídico
function showLipidConfirmationModal(result) {
    // Actualizar el estado del paciente en la lista para mostrar el icono de editar
    const patientIndex = allLipidPatients.findIndex(p => p.id === result.patient_id);
    if (patientIndex !== -1) {
        allLipidPatients[patientIndex].has_lipid_profile = true;
    }
    
    showConfirmationModal(
        result.patient_id, 
        result.database_id, 
        "Perfil Lipídico Guardado", 
        "Perfil lipídico guardado correctamente",
        { afterClose: 'lipid-patients' }
    );
}

// Mostrar modal de información No-HDL
window.showNonHDLInfoModal = function() {
    document.getElementById('nonHDLInfoModal').style.display = 'block';
};

// Cerrar modal de información No-HDL
window.closeNonHDLInfoModal = function() {
    document.getElementById('nonHDLInfoModal').style.display = 'none';
};

// ==================== Reporte para padres/tutores (antropometría) ====================

window.__anthroReportPatientId = null;
window.__anthroReportDatabaseId = null;

function escapeReportHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function reportRowPick(row, ...keys) {
    if (!row) return '';
    for (const k of keys) {
        if (k in row && row[k] != null && row[k] !== '' && String(row[k]).toLowerCase() !== 'nat') {
            return row[k];
        }
    }
    const lk = Object.keys(row);
    for (const k of keys) {
        const found = lk.find(x => String(x).toLowerCase() === String(k).toLowerCase());
        if (found && row[found] != null && row[found] !== '' && String(row[found]).toLowerCase() !== 'nat') {
            return row[found];
        }
    }
    return '';
}

function reportFullNameFromRow(row) {
    let n = reportRowPick(row, 'Nombre_Completo', 'Nombre_completo', 'NOMBRE_COMPLETO', 'nombre_completo', 'Nombre Completo');
    if (n) return String(n).trim();
    const n1 = reportRowPick(row, 'Nombre', 'Nombres', 'nombre', 'NOMBRE');
    const ap = reportRowPick(row, 'Apellido_paterno', 'Apellido_Paterno', 'Apellido_materno', 'Apellido_Materno', 'Apellidos', 'Apellido');
    const am = reportRowPick(row, 'Apellido_materno', 'Apellido_Materno');
    const parts = [n1, ap, am].filter(x => x && String(x).trim()).map(x => String(x).trim());
    return parts.join(' ').trim();
}

/** Solo la fecha del campo «Fecha de referencia (toma de medidas)» persistida en Excel. */
function reportReferenceDateIsoFromRow(row) {
    let raw = reportRowPick(row, 'Fecha_Referencia_Medidas', 'fecha_referencia_medidas', 'FECHA_REFERENCIA_MEDIDAS');
    if (!raw && row && typeof row === 'object') {
        const k = Object.keys(row).find(x => /referencia/i.test(x) && /medid/i.test(x));
        if (k && row[k] != null && String(row[k]).trim() !== '' && String(row[k]).toLowerCase() !== 'nat') {
            raw = row[k];
        }
    }
    if (!raw) return '';
    return normalizeAnthroDateInputValue(String(raw)) || '';
}

function reportReferenceIsoFromRow(row) {
    return reportReferenceDateIsoFromRow(row);
}

/** Meses totales a partir del texto guardado en Edad_Calculada (p. ej. «3 años y 9 meses»). */
function reportParsedTotalMonthsFromEdadCalculada(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    let m = s.match(/(\d+)\s*años?\s*y\s*(\d+)\s*meses?/);
    if (m) return parseInt(m[1], 10) * 12 + parseInt(m[2], 10);
    m = s.match(/(\d+)\s*años?\s+(\d+)\s*meses?/);
    if (m) return parseInt(m[1], 10) * 12 + parseInt(m[2], 10);
    m = s.match(/^(\d+)\s*años?\s*$/);
    if (m) return parseInt(m[1], 10) * 12;
    m = s.match(/^(\d+)\s*meses?\s*$/);
    if (m) return parseInt(m[1], 10);
    return null;
}

function reportBirthIsoFromRow(row) {
    const d = reportRowPick(row, 'Fecha_Nacimiento', 'fecha_nacimiento', 'FECHA_NACIMIENTO');
    if (!d) return '';
    return normalizeAnthroDateInputValue(String(d)) || '';
}

function reportAgeContextFromRow(row) {
    const storedAge = String(reportRowPick(row, 'Edad_Calculada', 'edad_calculada') || '').trim();
    const birth = reportBirthIsoFromRow(row);
    const refIso = reportReferenceDateIsoFromRow(row);

    let totalMonths = reportParsedTotalMonthsFromEdadCalculada(storedAge);
    if (totalMonths == null && birth && refIso) {
        const ai = calculateAgeInYearsAndMonths(birth, refIso);
        if (ai) totalMonths = ai.totalMonths;
    }

    let display = storedAge;
    if (!display) {
        if (birth && refIso) {
            const ai = calculateAgeInYearsAndMonths(birth, refIso);
            display = ai ? ai.display : '—';
        } else {
            display = '—';
        }
    }
    return { display, totalMonths };
}

function reportSexMfFromRow(row) {
    const s = String(reportRowPick(row, 'Sexo_Medidas', 'Sexo', 'sexo', 'SEXO') || '').trim();
    return normalizeAnthroSexForSelect(s) || 'M';
}

async function reportFetchOmsPercentiles(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const d = await r.json();
        if (!d.success || !d.percentiles) return null;
        return d.percentiles;
    } catch (e) {
        console.warn('OMS fetch', url, e);
        return null;
    }
}

function reportBmiOmsUrl(ageM, sex) {
    if (ageM == null || ageM < 0 || ageM > 228) return null;
    if (ageM <= 60) return `/oms-tables/bmi-percentiles?age_months=${ageM}&sex=${sex}`;
    return `/oms-tables/bmi-percentiles-5-19?age_months=${ageM}&sex=${sex}`;
}

function reportHeightOmsUrl(ageM, sex) {
    if (ageM == null || ageM < 0 || ageM > 228) return null;
    if (ageM <= 60) return `/oms-tables/height-percentiles?age_months=${ageM}&sex=${sex}`;
    return `/oms-tables/height-percentiles-5-19?age_months=${ageM}&sex=${sex}`;
}

function reportWeightOmsUrl(ageM, sex) {
    if (ageM == null || ageM < 0 || ageM > 120) return null;
    if (ageM <= 60) return `/oms-tables/weight-percentiles?age_months=${ageM}&sex=${sex}`;
    return `/oms-tables/weight-percentiles-5-10?age_months=${ageM}&sex=${sex}`;
}

function reportArmOmsUrl(ageM, sex) {
    if (ageM == null || ageM < 0 || ageM > 60) return null;
    return `/oms-tables/arm-percentiles?age_months=${ageM}&sex=${sex}`;
}

function reportHeadOmsUrl(ageM, sex) {
    if (ageM == null || ageM < 0 || ageM > 60) return null;
    return `/oms-tables/head-percentiles?age_months=${ageM}&sex=${sex}`;
}

async function reportBuildOmsVisualSection(row, ageM, sex) {
    if (ageM == null || !sex) {
        return '<p class="anthro-report-disclaimer">No fue posible calcular la edad en meses o el sexo para las gráficas OMS.</p>';
    }
    const sexLabel = sex === 'M' ? 'niño' : 'niña';
    const h = parseFloat(reportRowPick(row, 'Estatura_cm'));
    const w = parseFloat(reportRowPick(row, 'Peso_kg'));
    let bmi = parseFloat(reportRowPick(row, 'IMC_Calculado'));
    if (!isFinite(bmi) && isFinite(h) && isFinite(w) && h > 0) {
        bmi = w / Math.pow(h / 100, 2);
    }
    const metrics = [];
    const pBmi = await reportFetchOmsPercentiles(reportBmiOmsUrl(ageM, sex));
    if (isFinite(bmi) && pBmi) {
        const band = anthroClassifyOmsBand(bmi, pBmi);
        metrics.push({
            title: 'IMC',
            unit: 'kg/m²',
            key: 'bmi',
            value: bmi,
            p: pBmi,
            band
        });
    }
    const pH = await reportFetchOmsPercentiles(reportHeightOmsUrl(ageM, sex));
    if (isFinite(h) && pH) {
        metrics.push({
            title: 'Talla / estatura',
            unit: 'cm',
            key: 'height',
            value: h,
            p: pH,
            band: anthroClassifyOmsBand(h, pH)
        });
    }
    if (ageM <= 120) {
        const pW = await reportFetchOmsPercentiles(reportWeightOmsUrl(ageM, sex));
        if (isFinite(w) && pW) {
            metrics.push({
                title: 'Peso',
                unit: 'kg',
                key: 'weight',
                value: w,
                p: pW,
                band: anthroClassifyOmsBand(w, pW)
            });
        }
    }
    if (ageM <= 60) {
        const arm = parseFloat(reportRowPick(row, 'Perimetro_Braquial_cm', 'Perimetro_braquial_cm'));
        const pA = await reportFetchOmsPercentiles(reportArmOmsUrl(ageM, sex));
        if (isFinite(arm) && pA) {
            metrics.push({
                title: 'Perímetro braquial',
                unit: 'cm',
                key: 'arm',
                value: arm,
                p: pA,
                band: anthroClassifyOmsBand(arm, pA)
            });
        }
        const head = parseFloat(reportRowPick(row, 'Perimetro_Cefalico_cm', 'Perimetro_cefalico_cm'));
        const pHd = await reportFetchOmsPercentiles(reportHeadOmsUrl(ageM, sex));
        if (isFinite(head) && pHd) {
            metrics.push({
                title: 'Perímetro cefálico',
                unit: 'cm',
                key: 'head',
                value: head,
                p: pHd,
                band: anthroClassifyOmsBand(head, pHd)
            });
        }
    }
    if (metrics.length === 0) {
        return '<p class="anthro-report-disclaimer">No hay datos suficientes o tablas OMS no disponibles para reproducir las gráficas de referencia.</p>';
    }
    let cards = `<p class="anthro-report-disclaimer"><strong>Criterios visuales:</strong> referencia OMS para aprox. ${(ageM / 12).toFixed(1)} años, ${sexLabel}. Bandas: &lt;P15, P15–P85, P85–P97, &gt;P97. Las figuras usan el mismo criterio que el formulario de registro.</p>`;
    metrics.forEach(m => {
        const dec = m.key === 'bmi' ? 1 : 1;
        cards += `<div class="lipid-ref-card anthro-ref-card anthro-report-oms-card">
            <div class="lipid-ref-card-header">
                <p class="lipid-ref-card-title">${escapeReportHtml(m.title)}</p>
                <span class="${anthroPillClassFromBand(m.band.key)}">${m.value.toFixed(dec)} ${escapeReportHtml(m.unit)}</span>
            </div>
            <p class="lipid-ref-ranges">Referencia OMS (P3–P97 a esta edad). Estado: ${escapeReportHtml(m.band.label)}</p>
            ${renderAnthroOmsPercentileBar(m.value, m.p)}
            ${renderAnthroMiniCurveSvg(m.value, m.p)}
        </div>`;
    });
    return `<div class="anthro-report-oms-block">${cards}</div>`;
}

function reportFormatDisplayDate(isoOrAny) {
    if (!isoOrAny) return '—';
    const s = String(isoOrAny).trim().split('T')[0];
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return escapeReportHtml(s);
}

function reportAnthropometricDataRows(row) {
    const rrMin = reportRowPick(row, 'Frecuencia_Respiratoria_min', 'Frecuencia_Respiratoria_Min');
    const rr15 = reportRowPick(row, 'Frecuencia_Respiratoria_15s', 'Frecuencia_Respiratoria');
    let rrDisp = rr15;
    if (rrMin !== '' && rrMin != null && isFinite(Number(rrMin))) {
        const n = parseFloat(rrMin);
        if (!isNaN(n)) rrDisp = `${(n / 4).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} (equiv. ${n} /min)`;
    }
    return [
        ['Identificador en estudio', reportRowPick(row, 'ID_Unico', 'id_unico')],
        ['Fecha de nacimiento', reportFormatDisplayDate(reportBirthIsoFromRow(row) || reportRowPick(row, 'Fecha_Nacimiento'))],
        ['Edad calculada (referencia del registro)', reportRowPick(row, 'Edad_Calculada', 'edad_calculada')],
        ['Sexo (registro de medidas)', reportRowPick(row, 'Sexo_Medidas', 'Sexo', 'sexo')],
        ['Estatura (cm)', reportRowPick(row, 'Estatura_cm', 'estatura_cm')],
        ['Peso (kg)', reportRowPick(row, 'Peso_kg', 'peso_kg')],
        ['IMC calculado (kg/m²)', reportRowPick(row, 'IMC_Calculado', 'imc_calculado')],
        ['Percentil IMC (OMS)', reportRowPick(row, 'Percentil_IMC', 'Percentil_imc')],
        ['Percentil talla (OMS)', reportRowPick(row, 'Percentil_Talla', 'Percentil_talla')],
        ['Percentil peso (OMS)', reportRowPick(row, 'Percentil_Peso', 'Percentil_peso')],
        ['Circunferencia de cintura (cm)', reportRowPick(row, 'Circunferencia_Cintura_cm', 'circunferencia_cintura_cm')],
        ['Perímetro braquial (cm)', reportRowPick(row, 'Perimetro_Braquial_cm', 'Perimetro_braquial_cm')],
        ['Percentil perímetro braquial', reportRowPick(row, 'Percentil_Perimetro_Braquial', 'Percentil_perimetro_braquial')],
        ['Perímetro cefálico (cm)', reportRowPick(row, 'Perimetro_Cefalico_cm', 'Perimetro_cefalico_cm')],
        ['Percentil perímetro cefálico', reportRowPick(row, 'Percentil_Perimetro_Cefalico', 'Percentil_perimetro_cefalico')],
        ['Relación cintura–cadera', reportRowPick(row, 'Relacion_Cintura_Cadera', 'relacion_cintura_cadera')],
        ['Oxigenación (%)', reportRowPick(row, 'Oxigenacion_pct', 'Oxigenacion', 'oxigenacion_pct')],
        ['Frecuencia cardiaca (lpm)', reportRowPick(row, 'Frecuencia_Cardiaca_lpm', 'Frecuencia_Cardiaca')],
        ['Frecuencia respiratoria (15 s / nota)', rrDisp],
        ['Temperatura (°C)', reportRowPick(row, 'Temperatura_C', 'Temperatura', 'temperatura_c')]
    ];
}

function reportBuildDataTableHtml(row) {
    const rows = reportAnthropometricDataRows(row);
    let tr = '';
    rows.forEach(([k, v]) => {
        const val = v === '' || v === null || v === undefined ? '—' : String(v);
        tr += `<tr><th>${escapeReportHtml(k)}</th><td>${escapeReportHtml(val)}</td></tr>`;
    });
    return `<table class="anthro-report-table" role="presentation">${tr}</table>`;
}

function reportBuildVitalsVisualSection(row, ageM) {
    const o = parseFloat(reportRowPick(row, 'Oxigenacion_pct', 'Oxigenacion'));
    const hr = parseFloat(reportRowPick(row, 'Frecuencia_Cardiaca_lpm', 'Frecuencia_Cardiaca'));
    let rr15 = parseFloat(reportRowPick(row, 'Frecuencia_Respiratoria_15s', 'Frecuencia_Respiratoria'));
    const rrMinStored = parseFloat(reportRowPick(row, 'Frecuencia_Respiratoria_min', 'Frecuencia_Respiratoria_Min'));
    if (!isFinite(rr15) && isFinite(rrMinStored)) {
        rr15 = rrMinStored / 4;
    }
    const rrMin = isFinite(rr15) ? rr15 * 4 : NaN;
    const temp = parseFloat(reportRowPick(row, 'Temperatura_C', 'Temperatura'));
    if (![o, hr, rrMin, temp].some(isFinite)) return '';
    let h = '<h3>Signos vitales — referencia clínica (mismo criterio que el formulario)</h3>';
    h += '<p class="anthro-report-disclaimer">Las barras siguen los mismos rangos orientativos usados en la aplicación (AHA/PALS por edad para FC/FR; SpO₂ y temperatura con umbrales generales).</p>';
    if (isFinite(o)) {
        const band = classifyVitalsSpO2(o);
        h += `<div class="lipid-ref-card anthro-ref-card"><div class="lipid-ref-card-header"><p class="lipid-ref-card-title">Oxigenación (SpO₂)</p><span class="${anthroPillClassFromBand(band.key)}">${o.toFixed(1)} %</span></div>${renderVitalsSpO2Bar(o)}<p class="lipid-ref-ranges"><strong>Estado:</strong> ${band.label}</p></div>`;
    }
    if (isFinite(hr)) {
        const ref = getHeartRateRestingReference(ageM);
        const ax = vitalsSymmetricAxis(ref.min, ref.max);
        const band = classifyVitalsSymmetric(hr, ref.min, ref.max);
        h += `<div class="lipid-ref-card anthro-ref-card"><div class="lipid-ref-card-header"><p class="lipid-ref-card-title">Frecuencia cardíaca</p><span class="${anthroPillClassFromBand(band.key)}">${hr.toFixed(0)} lpm</span></div><p class="lipid-ref-ranges">Rango habitual ${ref.min}–${ref.max} lpm (${ref.bracket}).</p>${renderVitalsThreeZoneBar(hr, ax.axisMin, ax.axisMax, ref.min, ref.max)}<p class="lipid-ref-ranges"><strong>Estado:</strong> ${band.label}</p></div>`;
    }
    if (isFinite(rrMin)) {
        const ref = getRespiratoryRateReferenceBpm(ageM);
        const ax = vitalsSymmetricAxis(ref.min, ref.max);
        const band = classifyVitalsSymmetric(rrMin, ref.min, ref.max);
        h += `<div class="lipid-ref-card anthro-ref-card"><div class="lipid-ref-card-header"><p class="lipid-ref-card-title">Frecuencia respiratoria</p><span class="${anthroPillClassFromBand(band.key)}">${rrMin.toFixed(0)} /min</span></div><p class="lipid-ref-ranges">Valor en resp/min (campo original en resp/15 s × 4). Rango ${ref.min}–${ref.max} /min (${ref.bracket}).</p>${renderVitalsThreeZoneBar(rrMin, ax.axisMin, ax.axisMax, ref.min, ref.max)}<p class="lipid-ref-ranges"><strong>Estado:</strong> ${band.label}</p></div>`;
    }
    if (isFinite(temp)) {
        const band = classifyVitalsTemperature(temp);
        h += `<div class="lipid-ref-card anthro-ref-card"><div class="lipid-ref-card-header"><p class="lipid-ref-card-title">Temperatura</p><span class="${anthroPillClassFromBand(band.key)}">${temp.toFixed(1)} °C</span></div>${renderVitalsTemperatureBar(temp)}<p class="lipid-ref-ranges"><strong>Estado:</strong> ${band.label}</p></div>`;
    }
    return `<div class="anthro-report-section">${h}</div>`;
}

/**
 * Clona el reporte y convierte cada tarjeta con barras en imagen PNG
 * para que Word muestre lo mismo que la vista previa (Word no respeta bien flex/posición en las barras).
 * @param {string} rootElementId id del contenedor a clonar (p. ej. anthropometricReportPrintRoot)
 * @param {string[]} textareaLiveIds ids de textareas cuyo valor se copia al clon (mismo id en el HTML inyectado)
 */
async function reportPreparePrintRootForDocxExport(rootElementId, textareaLiveIds) {
    const root = document.getElementById(rootElementId);
    if (!root) return null;
    if (typeof html2canvas !== 'function') {
        console.warn('html2canvas no disponible; exportación Word sin rasterizar gráficas.');
    }

    const clone = root.cloneNode(true);
    const host = document.createElement('div');
    host.id = 'reportDocxExportHost';
    host.setAttribute(
        'aria-hidden',
        'true'
    );
    host.style.cssText =
        'position:fixed;left:-12000px;top:0;width:860px;max-width:100vw;box-sizing:border-box;padding:20px;background:#fff;z-index:-1;pointer-events:none;overflow:visible;';
    host.appendChild(clone);
    document.body.appendChild(host);

    try {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (_) {
                /* ignore */
            }
        }

        if (typeof html2canvas === 'function') {
            const cards = Array.from(clone.querySelectorAll('.lipid-ref-card'));
            for (const card of cards) {
                try {
                    const w = Math.max(1, Math.ceil(card.offsetWidth || card.getBoundingClientRect().width));
                    const h = Math.max(1, Math.ceil(card.scrollHeight || card.getBoundingClientRect().height));
                    const canvas = await html2canvas(card, {
                        scale: 2,
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: '#ffffff',
                        logging: false,
                        width: w,
                        height: h
                    });
                    const wrap = document.createElement('div');
                    wrap.className = 'anthro-report-card-raster';
                    wrap.setAttribute('style', 'margin:10px 0;text-align:center;');
                    const img = document.createElement('img');
                    img.src = canvas.toDataURL('image/png');
                    img.setAttribute('alt', 'Gráfica de referencia');
                    img.setAttribute('style', 'width:100%;max-width:100%;height:auto;display:block;border:1px solid #e2e8f0;border-radius:8px;');
                    wrap.appendChild(img);
                    card.replaceWith(wrap);
                } catch (e) {
                    console.warn('html2canvas tarjeta reporte:', e);
                }
            }
        }

        const ids = Array.isArray(textareaLiveIds) && textareaLiveIds.length
            ? textareaLiveIds
            : ['anthroReportObservationsInput', 'anthroReportMedidasSeguirInput'];
        ids.forEach((liveId) => {
            const tC = clone.querySelector('#' + liveId);
            const tL = document.getElementById(liveId);
            if (tC && tL) {
                const box = document.createElement('div');
                box.className = 'anthro-report-obs-export-block';
                box.setAttribute(
                    'style',
                    'border:1px solid #64748b;padding:10px;min-height:120px;white-space:pre-wrap;font-size:11pt;line-height:1.45;'
                );
                box.textContent = tL.value || ' ';
                tC.parentNode.replaceChild(box, tC);
            }
        });

        return clone;
    } finally {
        host.remove();
    }
}

// ==================== Notas persistidas: reporte padres/tutores (antropometría / perfil lipídico) ====================
let __parentReportAnthroSaveTimer = null;
let __parentReportLipidSaveTimer = null;

const PARENT_REPORT_NOTE_MAX_LEN = 20000;

function _clipParentReportNoteText(s) {
    const t = String(s || '');
    return t.length > PARENT_REPORT_NOTE_MAX_LEN ? t.slice(0, PARENT_REPORT_NOTE_MAX_LEN) : t;
}

function schedulePersistAnthropometricParentReportNotes() {
    clearTimeout(__parentReportAnthroSaveTimer);
    __parentReportAnthroSaveTimer = setTimeout(() => {
        persistAnthropometricParentReportNotes({ silent: true });
    }, 1500);
}

function schedulePersistLipidParentReportNotes() {
    clearTimeout(__parentReportLipidSaveTimer);
    __parentReportLipidSaveTimer = setTimeout(() => {
        persistLipidParentReportNotes({ silent: true });
    }, 1500);
}

async function persistAnthropometricParentReportNotes(options = {}) {
    const { silent = false, showToastOnOk = false } = options;
    const pid = window.__anthroReportPatientId;
    const db = window.__anthroReportDatabaseId || (selectedDatabase && selectedDatabase.id);
    const printRoot = document.getElementById('anthropometricReportPrintRoot');
    const obs = printRoot
        ? printRoot.querySelector('#anthroReportObservationsInput')
        : document.getElementById('anthroReportObservationsInput');
    const med = printRoot
        ? printRoot.querySelector('#anthroReportMedidasSeguirInput')
        : document.getElementById('anthroReportMedidasSeguirInput');
    if (!pid || !db || !obs || !med) {
        if (showToastOnOk) {
            const faltan = [];
            if (!pid) faltan.push('identificador del paciente');
            if (!db) faltan.push('base de datos');
            if (!obs) faltan.push('área Observaciones');
            if (!med) faltan.push('área Medidas a seguir');
            showToast(`No se puede guardar: ${faltan.join(', ')} no disponible(s).`, 'error');
        }
        return false;
    }
    try {
        const res = await fetch('/api/parent-report-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                database_id: db,
                patient_id: pid,
                anthropometric: {
                    observations: _clipParentReportNoteText(obs.value),
                    medidasSeguir: _clipParentReportNoteText(med.value)
                }
            })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) {
            const errMsg = j.detail || j.message || res.statusText || 'No se pudo guardar la interpretación';
            if (!silent) showToast(typeof errMsg === 'string' ? errMsg : 'No se pudo guardar la interpretación', 'error');
            return false;
        }
        if (showToastOnOk) showToast('Interpretación guardada', 'success');
        return true;
    } catch (e) {
        console.error(e);
        if (!silent) showToast('Error al guardar la interpretación', 'error');
        return false;
    }
}

async function persistLipidParentReportNotes(options = {}) {
    const { silent = false, showToastOnOk = false } = options;
    const pid = window.__lipidReportPatientId;
    const db = window.__lipidReportDatabaseId || (selectedLipidDatabase && selectedLipidDatabase.id);
    const printRoot = document.getElementById('lipidReportPrintRoot');
    const obs = printRoot
        ? printRoot.querySelector('#lipidReportObservationsInput')
        : document.getElementById('lipidReportObservationsInput');
    const med = printRoot
        ? printRoot.querySelector('#lipidReportMedidasSeguirInput')
        : document.getElementById('lipidReportMedidasSeguirInput');
    if (!pid || !db || !obs || !med) {
        if (showToastOnOk) {
            const faltan = [];
            if (!pid) faltan.push('identificador del paciente');
            if (!db) faltan.push('base de datos');
            if (!obs) faltan.push('área Observaciones');
            if (!med) faltan.push('área Medidas a seguir');
            showToast(`No se puede guardar: ${faltan.join(', ')} no disponible(s).`, 'error');
        }
        return false;
    }
    try {
        const res = await fetch('/api/parent-report-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                database_id: db,
                patient_id: pid,
                lipid: {
                    observations: _clipParentReportNoteText(obs.value),
                    medidasSeguir: _clipParentReportNoteText(med.value)
                }
            })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) {
            const errMsg = j.detail || j.message || res.statusText || 'No se pudo guardar la interpretación';
            if (!silent) showToast(typeof errMsg === 'string' ? errMsg : 'No se pudo guardar la interpretación', 'error');
            return false;
        }
        if (showToastOnOk) showToast('Interpretación guardada', 'success');
        return true;
    } catch (e) {
        console.error(e);
        if (!silent) showToast('Error al guardar la interpretación', 'error');
        return false;
    }
}

window.saveAnthropometricParentReportInterpretation = async function () {
    await persistAnthropometricParentReportNotes({ showToastOnOk: true });
};

window.saveLipidParentReportInterpretation = async function () {
    await persistLipidParentReportNotes({ showToastOnOk: true });
};

async function buildAnthropometricParentReportHtml(row, patientId) {
    const ageCtx = reportAgeContextFromRow(row);
    const ageM = ageCtx.totalMonths;
    const sex = reportSexMfFromRow(row);
    const nombre = reportFullNameFromRow(row) || `Participante ID ${patientId}`;
    const proc = 'Jardín de Niños Federico Froebel C.C.T 15PJN2906M';
    const omsHtml = await reportBuildOmsVisualSection(row, ageM, sex);
    const vitalsHtml = reportBuildVitalsVisualSection(row, ageM);
    return `
<div class="anthro-report-title-block">
    <p class="line-sm">PROTOCOLO DE INVESTIGACIÓN</p>
    <p class="line-lg">OBESIDAD-INFLAMACIÓN DE BAJO GRADO Y NEUROCOGNICIÓN</p>
    <p class="line-sm">ESCUELA SUPERIOR DE MEDICINA</p>
    <p class="line-sm">INSTITUTO POLITÉCNICO NACIONAL</p>
    <h2 class="anthro-report-h-main">REPORTE DE RESULTADOS</h2>
    <p class="line-sm" style="margin-top:10px">Medidas antropométricas</p>
</div>
<div class="anthro-report-section">
    <h3>Datos del participante</h3>
    <div class="anthro-report-patient-box">
        <p><strong>Nombre completo:</strong> ${escapeReportHtml(nombre)}</p>
        <p><strong>Identificador:</strong> ${escapeReportHtml(patientId)}</p>
        <p><strong>Fecha de nacimiento:</strong> ${escapeReportHtml(reportFormatDisplayDate(reportBirthIsoFromRow(row) || reportRowPick(row, 'Fecha_Nacimiento')))}</p>
        <p><strong>Edad (según registro):</strong> ${escapeReportHtml(ageCtx.display)}</p>
        <p><strong>Procedencia:</strong> ${escapeReportHtml(proc)}</p>
    </div>
</div>
<div class="anthro-report-section">
    <h3>Resultados registrados</h3>
    ${reportBuildDataTableHtml(row)}
</div>
<div class="anthro-report-section">
    <h3>Gráficas de referencia OMS (percentiles)</h3>
    ${omsHtml}
</div>
${vitalsHtml || ''}
<div class="anthro-report-section">
    <h3>Observaciones</h3>
    <textarea id="anthroReportObservationsInput" class="anthro-report-observations-textarea" rows="10" spellcheck="true" placeholder="Escriba aquí la interpretación para el expediente o la familia…"></textarea>
</div>
<div class="anthro-report-section">
    <h3>Medidas a seguir <span style="font-weight:500;font-size:0.9em">(Consultar con médico familiar)</span></h3>
    <textarea id="anthroReportMedidasSeguirInput" class="anthro-report-observations-textarea" rows="10" spellcheck="true" placeholder="Escriba aquí las medidas o recomendaciones a seguir…"></textarea>
</div>`;
}

window.openAnthropometricParentReport = async function (patientId, hasMeasurements) {
    if (!hasMeasurements) {
        showToast('No hay medidas antropométricas registradas para generar el reporte.', 'info');
        return;
    }
    if (!selectedDatabase || !selectedDatabase.id) {
        showToast('Seleccione una base de datos.', 'error');
        return;
    }
    const modal = document.getElementById('anthropometricReportModal');
    const bodyEl = document.getElementById('anthropometricReportPrintRoot');
    const loading = document.getElementById('anthropometricReportLoading');
    if (!modal || !bodyEl) return;
    window.__anthroReportDatabaseId = String(selectedDatabase.id);
    window.__anthroReportPatientId = String(patientId);
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    bodyEl.innerHTML = '';
    if (loading) loading.style.display = 'block';
    try {
        const res = await fetch(`/get-patient-measurements/${selectedDatabase.id}/${patientId}`);
        const json = await res.json();
        if (!json.success || !json.data) {
            showToast(json.message || 'No se pudieron cargar los datos del paciente', 'error');
            closeAnthropometricReportModal();
            return;
        }
        const fromList = allPatients.find((p) => String(p.id) === String(patientId));
        let row = { ...(fromList && fromList.data ? fromList.data : {}), ...json.data };
        const refKeys = ['Fecha_Referencia_Medidas', 'fecha_referencia_medidas'];
        const refEmpty = (r) => {
            if (!r) return true;
            for (const k of refKeys) {
                const v = r[k];
                if (v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'nat') return false;
            }
            return true;
        };
        if (fromList && fromList.data && refEmpty(json.data) && !refEmpty(fromList.data)) {
            for (const k of refKeys) {
                if (fromList.data[k] != null && String(fromList.data[k]).trim() !== '') {
                    row[k] = fromList.data[k];
                }
            }
        }
        const html = await buildAnthropometricParentReportHtml(row, patientId);
        bodyEl.innerHTML = html;
        try {
            const dbNotes = window.__anthroReportDatabaseId || String(selectedDatabase.id);
            const nr = await fetch(
                `/api/parent-report-notes/${encodeURIComponent(dbNotes)}/${encodeURIComponent(String(patientId))}`
            );
            let nj = {};
            try {
                nj = await nr.json();
            } catch (_) {
                nj = {};
            }
            if (!nr.ok || !nj.success) {
                console.warn('Cargar notas reporte antropométrico:', nr.status, nj && nj.detail ? nj.detail : '');
            } else if (nj.anthropometric) {
                const oEl = bodyEl.querySelector('#anthroReportObservationsInput');
                const mEl = bodyEl.querySelector('#anthroReportMedidasSeguirInput');
                if (oEl) oEl.value = nj.anthropometric.observations || '';
                if (mEl) mEl.value = nj.anthropometric.medidasSeguir || '';
            }
        } catch (err) {
            console.warn('Cargar notas reporte antropométrico:', err);
        }
        const oIn = bodyEl.querySelector('#anthroReportObservationsInput');
        const mIn = bodyEl.querySelector('#anthroReportMedidasSeguirInput');
        const onAnthroNoteInput = () => schedulePersistAnthropometricParentReportNotes();
        if (oIn) oIn.addEventListener('input', onAnthroNoteInput);
        if (mIn) mIn.addEventListener('input', onAnthroNoteInput);
    } catch (e) {
        console.error(e);
        showToast('Error al generar el reporte', 'error');
        closeAnthropometricReportModal();
    } finally {
        if (loading) loading.style.display = 'none';
    }
};

window.closeAnthropometricReportModal = async function () {
    clearTimeout(__parentReportAnthroSaveTimer);
    await persistAnthropometricParentReportNotes({ silent: true });
    const modal = document.getElementById('anthropometricReportModal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
    window.__anthroReportPatientId = null;
    window.__anthroReportDatabaseId = null;
};

window.printAnthropometricParentReport = async function () {
    const root = document.getElementById('anthropometricReportPrintRoot');
    if (!root || !root.innerHTML.trim()) {
        showToast('No hay contenido para imprimir', 'info');
        return;
    }
    clearTimeout(__parentReportAnthroSaveTimer);
    await persistAnthropometricParentReportNotes({ silent: true });
    window.print();
};

window.downloadAnthropometricParentReportWord = async function () {
    const root = document.getElementById('anthropometricReportPrintRoot');
    if (!root || !root.innerHTML.trim()) {
        showToast('No hay contenido para exportar', 'info');
        return;
    }
    if (typeof htmlDocx === 'undefined' || typeof saveAs === 'undefined') {
        showToast('No se cargaron las librerías para Word (html-docx / FileSaver). Compruebe su conexión.', 'error');
        return;
    }
    clearTimeout(__parentReportAnthroSaveTimer);
    await persistAnthropometricParentReportNotes({ silent: true });
    showToast('Generando Word (capturando gráficas)…', 'info');
    let fragment;
    try {
        fragment = await reportPreparePrintRootForDocxExport('anthropometricReportPrintRoot', [
            'anthroReportObservationsInput',
            'anthroReportMedidasSeguirInput'
        ]);
    } catch (e) {
        console.error(e);
        showToast('Error al preparar el documento', 'error');
        return;
    }
    if (!fragment) {
        showToast('No se pudo preparar el documento', 'error');
        return;
    }
    const docxStyle = `<style>
        body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 11pt; line-height: 1.45; }
        table.anthro-report-table { border-collapse: collapse; width: 100%; }
        table.anthro-report-table th, table.anthro-report-table td { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: top; }
        h2, h3 { color: #0f766e; }
        .anthro-report-title-block { text-align: center; margin-bottom: 1rem; }
        .anthro-report-patient-box { border: 1px solid #94a3b8; padding: 10px; background: #f8fafc; }
        .anthro-report-card-raster img { max-width: 100%; height: auto; }
    </style>`;
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="es"><head><meta charset="utf-8">${docxStyle}</head><body>${fragment.innerHTML}</body></html>`;
    try {
        const blob = htmlDocx.asBlob(html);
        const pid = window.__anthroReportPatientId || 'paciente';
        saveAs(blob, `reporte-antropometria-${pid}.docx`);
        showToast('Documento Word descargado', 'success');
    } catch (err) {
        console.error(err);
        showToast('Error al generar Word. Si persiste, pruebe otro navegador.', 'error');
    }
};

// ==================== Reporte para padres/tutores (perfil lipídico) ====================

window.__lipidReportPatientId = null;
window.__lipidReportDatabaseId = null;

function reportLipidAgeMonthsFromRow(row) {
    let birthIso = reportBirthIsoFromRow(row);
    if (!birthIso) {
        const raw = reportRowPick(row, 'birthdate');
        if (raw) birthIso = normalizeAnthroDateInputValue(String(raw)) || '';
    }
    if (!birthIso) return null;
    const ai = calculateAgeInYearsAndMonths(birthIso, getTodayLocalISO());
    return ai ? ai.totalMonths : null;
}

function reportLipidAgeDisplayFromRow(row) {
    const ctx = reportAgeContextFromRow(row);
    if (ctx.display && ctx.display !== '—') return ctx.display;
    let birthIso = reportBirthIsoFromRow(row);
    if (!birthIso) {
        const raw = reportRowPick(row, 'birthdate');
        if (raw) birthIso = normalizeAnthroDateInputValue(String(raw)) || '';
    }
    if (birthIso) {
        const ai = calculateAgeInYearsAndMonths(birthIso, getTodayLocalISO());
        if (ai) return ai.display;
    }
    return '—';
}

function reportLipidValsFromRow(row) {
    const pickNum = (...keys) => {
        const v = reportRowPick(row, ...keys);
        if (v === '' || v == null) return NaN;
        const n = parseFloat(String(v).replace(',', '.'));
        return isFinite(n) ? n : NaN;
    };
    const tc = pickNum('Colesterol_Total_mg_dL', 'totalCholesterol');
    const hdl = pickNum('HDL_Colesterol_mg_dL', 'hdlCholesterol');
    const ldl = pickNum('LDL_Colesterol_mg_dL', 'ldlCholesterol');
    const tg = pickNum('Trigliceridos_mg_dL', 'triglycerides');
    const vldl = pickNum('VLDL_Colesterol_mg_dL', 'vldlCholesterol');
    const glu = pickNum('Glucosa_mg_dL', 'glucose');
    const nonHdl = pickNum('No_HDL_Colesterol_mg_dL', 'nonHdlCholesterol');
    let ratio = pickNum('Relacion_CT_HDL', 'Relacion_Colesterol_Total_HDL', 'cholesterolRatio');
    if (!isFinite(ratio) && isFinite(tc) && isFinite(hdl) && hdl > 0) {
        ratio = tc / hdl;
    }
    return { tc, hdl, ldl, tg, vldl, glu, nonHdl, ratio };
}

/**
 * Texto para reporte / tabla: prioridad al valor persistido (Excel/API), con detección flexible de nombre de columna;
 * si no hay texto guardado, misma cadena que el formulario a partir del No-HDL numérico de la fila.
 */
function reportLipidCardiovascularRiskDisplay(row) {
    let t = reportRowPick(row, 'Riesgo_Cardiovascular', 'Riesgo_cardiovascular', 'cardiovascularRisk', 'RIESGO_CARDIOVASCULAR');
    if (t !== '' && t != null) return String(t).trim();
    if (row && typeof row === 'object') {
        const rk = Object.keys(row).find(k => /riesgo/i.test(String(k)) && /cardio/i.test(String(k)));
        if (rk != null) {
            const v = row[rk];
            if (v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'nat') {
                return String(v).trim();
            }
        }
    }
    return getCardiovascularRiskLabelFromNonHdl(reportLipidValsFromRow(row).nonHdl);
}

function reportMergeLipidProfileFetchIntoRow(json, patientExcelRow) {
    let row = { ...(patientExcelRow && typeof patientExcelRow === 'object' ? patientExcelRow : {}) };
    const ld = json.lipid_data || {};
    const map = [
        ['totalCholesterol', 'Colesterol_Total_mg_dL'],
        ['hdlCholesterol', 'HDL_Colesterol_mg_dL'],
        ['ldlCholesterol', 'LDL_Colesterol_mg_dL'],
        ['triglycerides', 'Trigliceridos_mg_dL'],
        ['vldlCholesterol', 'VLDL_Colesterol_mg_dL'],
        ['glucose', 'Glucosa_mg_dL'],
        ['nonHdlCholesterol', 'No_HDL_Colesterol_mg_dL']
    ];
    map.forEach(([apiKey, excelKey]) => {
        const v = ld[apiKey];
        if (v != null && v !== '' && isFinite(Number(v))) {
            row[excelKey] = v;
        }
    });
    if (ld.cardiovascularRisk != null && String(ld.cardiovascularRisk).trim() !== '') {
        row.Riesgo_Cardiovascular = String(ld.cardiovascularRisk).trim();
    } else if (row && typeof row === 'object') {
        const rk = Object.keys(row).find(k => /riesgo/i.test(String(k)) && /cardio/i.test(String(k)));
        if (rk != null) {
            const v = row[rk];
            if (v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'nat') {
                row.Riesgo_Cardiovascular = String(v).trim();
            }
        }
    }
    const pi = json.patient_info || {};
    if (pi.birthdate && !String(reportRowPick(row, 'Fecha_Nacimiento', 'fecha_nacimiento') || '').trim()) {
        row.Fecha_Nacimiento = pi.birthdate;
    }
    if (pi.sex && !String(reportRowPick(row, 'Sexo', 'sexo') || '').trim()) {
        row.Sexo = pi.sex;
    }
    return row;
}

function reportBuildLipidDataTableHtml(row) {
    const rows = [
        ['Identificador en estudio', reportRowPick(row, 'ID_Unico', 'id_unico')],
        ['Fecha de nacimiento', reportFormatDisplayDate(reportBirthIsoFromRow(row) || reportRowPick(row, 'Fecha_Nacimiento', 'birthdate'))],
        ['Edad (referencia del registro o fecha actual)', reportLipidAgeDisplayFromRow(row)],
        ['Sexo', reportRowPick(row, 'Sexo_Medidas', 'Sexo', 'sexo')],
        ['Colesterol total (mg/dL)', reportRowPick(row, 'Colesterol_Total_mg_dL', 'totalCholesterol')],
        ['HDL colesterol (mg/dL)', reportRowPick(row, 'HDL_Colesterol_mg_dL', 'hdlCholesterol')],
        ['LDL colesterol (mg/dL)', reportRowPick(row, 'LDL_Colesterol_mg_dL', 'ldlCholesterol')],
        ['Triglicéridos (mg/dL)', reportRowPick(row, 'Trigliceridos_mg_dL', 'triglycerides')],
        ['VLDL (mg/dL)', reportRowPick(row, 'VLDL_Colesterol_mg_dL', 'vldlCholesterol')],
        ['No-HDL (mg/dL)', reportRowPick(row, 'No_HDL_Colesterol_mg_dL', 'nonHdlCholesterol')],
        ['Glucosa en ayunas (mg/dL)', reportRowPick(row, 'Glucosa_mg_dL', 'glucose')],
        ['Relación CT/HDL', (() => {
            const v = reportLipidValsFromRow(row);
            return isFinite(v.ratio) && v.ratio > 0 ? v.ratio.toFixed(2) : reportRowPick(row, 'Relacion_CT_HDL', 'cholesterolRatio');
        })()],
        ['Riesgo cardiovascular (texto en registro, si existe)', reportLipidCardiovascularRiskDisplay(row)]
    ];
    let tr = '';
    rows.forEach(([k, v]) => {
        const val = v === '' || v === null || v === undefined ? '—' : String(v);
        tr += `<tr><th>${escapeReportHtml(k)}</th><td>${escapeReportHtml(val)}</td></tr>`;
    });
    return `<table class="anthro-report-table" role="presentation">${tr}</table>`;
}

function buildLipidParentReportHtml(row, patientId) {
    const nombre = reportFullNameFromRow(row) || `Participante ID ${patientId}`;
    const proc = 'Jardín de Niños Federico Froebel C.C.T 15PJN2906M';
    const ageM = reportLipidAgeMonthsFromRow(row);
    const vals = reportLipidValsFromRow(row);
    const refHtml = buildLipidReferenceVisualBlockHtml(ageM, vals, { includeInfoButton: false, appendRiskNote: false });
    return `
<div class="anthro-report-title-block">
    <p class="line-sm">PROTOCOLO DE INVESTIGACIÓN</p>
    <p class="line-lg">OBESIDAD-INFLAMACIÓN DE BAJO GRADO Y NEUROCOGNICIÓN</p>
    <p class="line-sm">ESCUELA SUPERIOR DE MEDICINA</p>
    <p class="line-sm">INSTITUTO POLITÉCNICO NACIONAL</p>
    <h2 class="anthro-report-h-main">REPORTE DE RESULTADOS</h2>
    <p class="line-sm" style="margin-top:10px">Perfil lipídico (laboratorio)</p>
</div>
<div class="anthro-report-section">
    <h3>Datos del participante</h3>
    <div class="anthro-report-patient-box">
        <p><strong>Nombre completo:</strong> ${escapeReportHtml(nombre)}</p>
        <p><strong>Identificador:</strong> ${escapeReportHtml(patientId)}</p>
        <p><strong>Fecha de nacimiento:</strong> ${escapeReportHtml(reportFormatDisplayDate(reportBirthIsoFromRow(row) || reportRowPick(row, 'Fecha_Nacimiento', 'birthdate')))}</p>
        <p><strong>Edad (según registro):</strong> ${escapeReportHtml(reportLipidAgeDisplayFromRow(row))}</p>
        <p><strong>Procedencia:</strong> ${escapeReportHtml(proc)}</p>
    </div>
</div>
<div class="anthro-report-section">
    <h3>Resultados registrados</h3>
    ${reportBuildLipidDataTableHtml(row)}
</div>
<div class="anthro-report-section">
    <h3>Comparación con rangos de referencia</h3>
    <p class="anthro-report-disclaimer">Las barras y textos siguen los mismos criterios NHLBI / ATP III / NOM-015 que la pantalla de registro de perfil lipídico (edad calculada respecto a la fecha actual para umbrales pediátricos vs adultos).</p>
    ${refHtml}
</div>
<div class="anthro-report-section">
    <h3>Observaciones</h3>
    <textarea id="lipidReportObservationsInput" class="anthro-report-observations-textarea" rows="10" spellcheck="true" placeholder="Escriba aquí la interpretación para el expediente o la familia…"></textarea>
</div>
<div class="anthro-report-section">
    <h3>Medidas a seguir <span style="font-weight:500;font-size:0.9em">(Consultar con médico familiar)</span></h3>
    <textarea id="lipidReportMedidasSeguirInput" class="anthro-report-observations-textarea" rows="10" spellcheck="true" placeholder="Escriba aquí las medidas o recomendaciones a seguir…"></textarea>
</div>`;
}

window.openLipidParentReport = async function (patientId, hasLipidProfile) {
    if (!hasLipidProfile) {
        showToast('No hay perfil lipídico registrado para generar el reporte.', 'info');
        return;
    }
    if (!selectedLipidDatabase || !selectedLipidDatabase.id) {
        showToast('Seleccione una base de datos.', 'error');
        return;
    }
    const modal = document.getElementById('lipidParentReportModal');
    const bodyEl = document.getElementById('lipidReportPrintRoot');
    const loading = document.getElementById('lipidReportLoading');
    if (!modal || !bodyEl) return;
    window.__lipidReportDatabaseId = String(selectedLipidDatabase.id);
    window.__lipidReportPatientId = String(patientId);
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    bodyEl.innerHTML = '';
    if (loading) loading.style.display = 'block';
    try {
        const res = await fetch(`/get-patient-lipid-profile/${selectedLipidDatabase.id}/${patientId}`);
        const json = await res.json();
        if (!json.success) {
            showToast(json.message || 'No se pudieron cargar los datos del paciente', 'error');
            closeLipidParentReportModal();
            return;
        }
        const excelRow = selectedLipidDatabase.data.find(r => String(r.ID_Unico) === String(patientId));
        const row = reportMergeLipidProfileFetchIntoRow(json, excelRow || {});
        const html = buildLipidParentReportHtml(row, patientId);
        bodyEl.innerHTML = html;
        try {
            const dbNotes = window.__lipidReportDatabaseId || String(selectedLipidDatabase.id);
            const nr = await fetch(
                `/api/parent-report-notes/${encodeURIComponent(dbNotes)}/${encodeURIComponent(String(patientId))}`
            );
            let nj = {};
            try {
                nj = await nr.json();
            } catch (_) {
                nj = {};
            }
            if (!nr.ok || !nj.success) {
                console.warn('Cargar notas reporte perfil lipídico:', nr.status, nj && nj.detail ? nj.detail : '');
            } else if (nj.lipid) {
                const oEl = bodyEl.querySelector('#lipidReportObservationsInput');
                const mEl = bodyEl.querySelector('#lipidReportMedidasSeguirInput');
                if (oEl) oEl.value = nj.lipid.observations || '';
                if (mEl) mEl.value = nj.lipid.medidasSeguir || '';
            }
        } catch (err) {
            console.warn('Cargar notas reporte perfil lipídico:', err);
        }
        const oIn = bodyEl.querySelector('#lipidReportObservationsInput');
        const mIn = bodyEl.querySelector('#lipidReportMedidasSeguirInput');
        const onLipidNoteInput = () => schedulePersistLipidParentReportNotes();
        if (oIn) oIn.addEventListener('input', onLipidNoteInput);
        if (mIn) mIn.addEventListener('input', onLipidNoteInput);
    } catch (e) {
        console.error(e);
        showToast('Error al generar el reporte', 'error');
        closeLipidParentReportModal();
    } finally {
        if (loading) loading.style.display = 'none';
    }
};

window.closeLipidParentReportModal = async function () {
    clearTimeout(__parentReportLipidSaveTimer);
    await persistLipidParentReportNotes({ silent: true });
    const modal = document.getElementById('lipidParentReportModal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
    window.__lipidReportPatientId = null;
    window.__lipidReportDatabaseId = null;
};

window.printLipidParentReport = async function () {
    const root = document.getElementById('lipidReportPrintRoot');
    if (!root || !root.innerHTML.trim()) {
        showToast('No hay contenido para imprimir', 'info');
        return;
    }
    clearTimeout(__parentReportLipidSaveTimer);
    await persistLipidParentReportNotes({ silent: true });
    window.print();
};

window.downloadLipidParentReportWord = async function () {
    const root = document.getElementById('lipidReportPrintRoot');
    if (!root || !root.innerHTML.trim()) {
        showToast('No hay contenido para exportar', 'info');
        return;
    }
    if (typeof htmlDocx === 'undefined' || typeof saveAs === 'undefined') {
        showToast('No se cargaron las librerías para Word (html-docx / FileSaver). Compruebe su conexión.', 'error');
        return;
    }
    clearTimeout(__parentReportLipidSaveTimer);
    await persistLipidParentReportNotes({ silent: true });
    showToast('Generando Word (capturando gráficas)…', 'info');
    let fragment;
    try {
        fragment = await reportPreparePrintRootForDocxExport('lipidReportPrintRoot', [
            'lipidReportObservationsInput',
            'lipidReportMedidasSeguirInput'
        ]);
    } catch (e) {
        console.error(e);
        showToast('Error al preparar el documento', 'error');
        return;
    }
    if (!fragment) {
        showToast('No se pudo preparar el documento', 'error');
        return;
    }
    const docxStyle = `<style>
        body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 11pt; line-height: 1.45; }
        table.anthro-report-table { border-collapse: collapse; width: 100%; }
        table.anthro-report-table th, table.anthro-report-table td { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: top; }
        h2, h3 { color: #0f766e; }
        .anthro-report-title-block { text-align: center; margin-bottom: 1rem; }
        .anthro-report-patient-box { border: 1px solid #94a3b8; padding: 10px; background: #f8fafc; }
        .anthro-report-card-raster img { max-width: 100%; height: auto; }
    </style>`;
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="es"><head><meta charset="utf-8">${docxStyle}</head><body>${fragment.innerHTML}</body></html>`;
    try {
        const blob = htmlDocx.asBlob(html);
        const pid = window.__lipidReportPatientId || 'paciente';
        saveAs(blob, `reporte-perfil-lipidico-${pid}.docx`);
        showToast('Documento Word descargado', 'success');
    } catch (err) {
        console.error(err);
        showToast('Error al generar Word. Si persiste, pruebe otro navegador.', 'error');
    }
};

