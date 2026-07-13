/**
 * Módulo de Historia Clínica - JavaScript
 * Maneja toda la lógica del frontend para el módulo de Historia Clínica
 */

// Variables globales para el módulo HC
let selectedHCDatabase = null;
let selectedHCPatient = null;

// Función para recalcular altura del expander
function recalculateHCExpanderHeight() {
    const expanderContent = document.getElementById('hcExpanderContent');
    if (expanderContent && expanderContent.classList.contains('expanded')) {
        setTimeout(() => {
            const contentHeight = expanderContent.scrollHeight;
            expanderContent.style.maxHeight = (contentHeight + 100) + 'px';
        }, 50);
    }
}
let allHCPatients = [];
let currentHCTab = 'patient-data';

// Inicialización del módulo HC
document.addEventListener('DOMContentLoaded', function() {
    
    // Asegurar que el expander esté cerrado por defecto
    const hcExpanderContent = document.getElementById('hcExpanderContent');
    if (hcExpanderContent) {
        hcExpanderContent.style.maxHeight = '0px';
        hcExpanderContent.style.padding = '0px';
    }
    initHCHermanosColumnsClone();
    if (typeof syncHermanosColumnsCount === 'function') syncHermanosColumnsCount();
});

// Función para alternar el expander de Historia Clínica
function toggleHCExpander() {
    const expanderContent = document.getElementById('hcExpanderContent');
    const toggleBtn = document.querySelector('.hc-header .btn i');
    
    
    if (expanderContent.style.maxHeight === '0px' || expanderContent.style.maxHeight === '' || expanderContent.style.display === 'none') {
        // Abrir expander
        expanderContent.style.display = 'block';
        expanderContent.style.padding = '20px';
        expanderContent.classList.add('expanded');
        toggleBtn.classList.remove('fa-chevron-down');
        toggleBtn.classList.add('fa-chevron-up');
        
        // Calcular altura dinámicamente después de un breve delay para que el contenido se renderice
        setTimeout(() => {
            const contentHeight = expanderContent.scrollHeight;
            expanderContent.style.maxHeight = (contentHeight + 100) + 'px'; // +100px de margen
        }, 100);
        
        // Cargar bases de datos si no están cargadas
        if (!selectedHCDatabase) {
            loadHCDatabases();
        }
    } else {
        // Cerrar expander
        expanderContent.style.display = 'none';
        expanderContent.style.maxHeight = '0px';
        expanderContent.style.padding = '0px';
        expanderContent.classList.remove('expanded');
        toggleBtn.classList.remove('fa-chevron-up');
        toggleBtn.classList.add('fa-chevron-down');
    }
};

// Cargar bases de datos para Historia Clínica
async function loadHCDatabases() {
    try {
        const response = await fetch('/files');
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            displayHCDatabases(result.files);
        } else {
            throw new Error('Error en la respuesta del servidor');
        }
        
    } catch (error) {
        console.error('Error cargando bases de datos para HC:', error);
        showToast('Error cargando bases de datos para Historia Clínica', 'error');
    }
}

// Mostrar bases de datos disponibles
function displayHCDatabases(files) {
    const databaseList = document.getElementById('hcDatabaseList');
    databaseList.innerHTML = '';
    
    if (files.length === 0) {
        databaseList.innerHTML = '<p class="text-muted">No hay bases de datos disponibles</p>';
        return;
    }
    
    files.forEach(file => {
        const databaseItem = document.createElement('div');
        databaseItem.className = 'database-item';
        
        databaseItem.innerHTML = `
            <div class="database-info">
                <h6><i class="fas fa-database"></i> ${file.filename || 'Base de datos'}</h6>
                <div class="database-details">
                    <p><i class="fas fa-table"></i> ${file.rows || 0} filas</p>
                    <p><i class="fas fa-columns"></i> ${file.columns ? file.columns.length : 0} columnas</p>
                    <p><i class="fas fa-calendar"></i> ${formatDate(file.created_at)}</p>
                </div>
            </div>
            <div class="database-actions">
                <button class="btn btn-primary select-db-btn">
                    <i class="fas fa-check"></i> Seleccionar
                </button>
            </div>
        `;
        
        // Agregar event listener al botón después de crear el HTML
        const selectBtn = databaseItem.querySelector('.select-db-btn');
        selectBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            selectHCDatabase(file);
        });
        
        databaseList.appendChild(databaseItem);
    });
}

// Seleccionar base de datos para Historia Clínica
async function selectHCDatabase(database) {
    try {
        selectedHCDatabase = database;
        
        // Ocultar selector de bases de datos y mostrar selector de pacientes
        document.getElementById('hcDatabaseSelector').style.display = 'none';
        document.getElementById('hcPatientSelector').style.display = 'block';
        
        // Cargar pacientes de la base de datos seleccionada usando el endpoint estándar
        await loadHCPatients(database.id);
        
    } catch (error) {
        console.error('Error seleccionando base de datos para HC:', error);
        showToast('Error seleccionando base de datos', 'error');
    }
}

// Cargar pacientes de la base de datos seleccionada
async function loadHCPatients(databaseId) {
    try {
        const response = await fetch(`/api/hc/patients/${databaseId}`);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            allHCPatients = result.patients;
            displayHCPatients(allHCPatients);
        } else {
            throw new Error('Error en la respuesta del servidor');
        }
        
    } catch (error) {
        console.error('Error cargando pacientes para HC:', error);
        showToast('Error cargando pacientes', 'error');
    }
}

// Cargar pacientes usando el endpoint estándar (mismo que otros módulos)
async function loadHCPatientsFromStandardEndpoint(databaseId) {
    try {
        const response = await fetch(`/files/${databaseId}/complete`);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Mapear los datos del endpoint estándar al formato esperado
            allHCPatients = result.data.map(row => ({
                id: row.ID_Unico,
                has_hc: checkPatientHasHCFromData(row)
            }));
            
            displayHCPatients(allHCPatients);
        } else {
            throw new Error('Error en la respuesta del servidor');
        }
        
    } catch (error) {
        console.error('Error cargando pacientes para HC:', error);
        showToast('Error cargando pacientes', 'error');
    }
}

// Verificar si un paciente tiene historia clínica basado en los datos
// NOTA: Esta función se usa cuando se carga desde el endpoint estándar /files/{id}/complete
// Para verificación precisa, se debe usar el endpoint /api/hc/patients/{database_id}
function checkPatientHasHCFromData(row) {
    // Verificar columnas que SÍ se guardan en BD (no las de "Datos del Paciente")
    const hcColumns = [
        // Datos del Tutor
        'escolaridad_m', 'escolaridad_p',
        // Antecedentes Personales
        'embarazo_numero', 'curso_normal', 'semanas_gestacion', 'termino',
        'sitio_parto', 'tipo_parto', 'peso_nacer', 'talla_nacer',
        'ruptura_membrana', 'complicaciones', 'tamiz_neonatal', 'result_tamiz',
        'lactancia_materna', 'ablactacion', 'actividad_fisica',
        // Desarrollo Psicomotor
        'escolaridad_actual', 'exp_sust_tox',
        // Antecedentes Heredofamiliares
        'diabetes_m', 'preclamsia_m', 'infecc_embarazo_m', 'obes_m', 'sm_m',
        'HTA_m', 'hipercolesterolemia_m', 'hipertrigli_m',
        'diabetes_p', 'obes_p', 'sm_p', 'HTA_p', 'hipercolesterolemia_p', 'hipertrigli_p'
    ];
    
    return hcColumns.some(col => row[col] && row[col].toString().trim() !== '');
}

// Mostrar lista de pacientes
function displayHCPatients(patients) {
    const patientList = document.getElementById('hcPatientList');
    patientList.innerHTML = '';
    
    if (patients.length === 0) {
        patientList.innerHTML = '<p class="text-muted">No hay pacientes disponibles</p>';
        return;
    }
    
    patients.forEach(patient => {
        const patientItem = document.createElement('div');
        patientItem.className = 'patient-item';
        patientItem.onclick = () => selectHCPatient(patient);
        
        // Determinar estado y botón
        const hasHC = patient.has_hc;
        const statusIcon = hasHC ? 
            '<i class="fas fa-check-circle text-success" title="Historia clínica registrada"></i>' : 
            '<i class="fas fa-plus-circle text-primary" title="Sin historia clínica"></i>';
        const statusText = hasHC ? 'Historia clínica ✓' : 'Sin historia clínica';

        const actionsHtml = hasHC ? `
            <button class="hc-action-btn hc-edit" title="Editar Historia Clínica">
                <i class="fas fa-edit"></i>
            </button>
            <button class="hc-action-btn hc-export" title="Exportar Historia Clínica">
                <i class="fas fa-file-pdf"></i>
            </button>
        ` : `
            <button class="hc-action-btn hc-create" title="Crear Historia Clínica">
                <i class="fas fa-plus"></i>
            </button>
        `;
        
        patientItem.innerHTML = `
            <div class="patient-info">
                <h6><i class="fas fa-user"></i> Paciente ${patient.id}</h6>
                <div class="patient-status">
                    <p>${statusIcon} ${statusText}</p>
                </div>
            </div>
            <div class="patient-actions">
                ${actionsHtml}
            </div>
        `;
        
        const createBtn = patientItem.querySelector('.hc-create');
        if (createBtn) {
            createBtn.addEventListener('click', (event) => {
            event.stopPropagation();
                selectHCPatient(patient);
            });
        }

        const editBtn = patientItem.querySelector('.hc-edit');
        if (editBtn) {
            editBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                editHCPatient(patient);
            });
        }

        const exportBtn = patientItem.querySelector('.hc-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', async (event) => {
                event.stopPropagation();
                await downloadHCPatientPdf(patient);
            });
        }
        
        patientList.appendChild(patientItem);
    });
}

// Seleccionar paciente para Historia Clínica
async function selectHCPatient(patient) {
    
    try {
        // Verificar si el paciente ya tiene historia clínica
        const response = await fetch(`/api/hc/check-patient-hc/${selectedHCDatabase.id}/${patient.id}`);
        
        if (!response.ok) {
            proceedWithHCPatientSelection(patient);
            return;
        }
        
        const result = await response.json();
        
        if (result.has_hc) {
            // Mostrar mensaje de que ya fue procesado
            showHCPatientAlreadyProcessedModal(patient.id);
            return;
        }
        
        // Si no tiene historia clínica, continuar normalmente
        proceedWithHCPatientSelection(patient);
        
    } catch (error) {
        console.error('Error verificando historia clínica:', error);
        // En caso de error, permitir el procesamiento normal
        proceedWithHCPatientSelection(patient);
    }
}

// Proceder con la selección del paciente
function proceedWithHCPatientSelection(patient) {
    
    selectedHCPatient = patient;
    
    // Ocultar selector de pacientes y mostrar formulario
    document.getElementById('hcPatientSelector').style.display = 'none';
    document.getElementById('hcForm').style.display = 'block';
    
    // Mostrar información del paciente
    displayHCPatientInfo(patient);
    
    // Limpiar TODAS las secciones del formulario (paciente nuevo)
    resetHCFormComplete();
    
    // Llenar automáticamente el ID del paciente
    document.getElementById('hcIdPaciente').value = patient.id;
    
    // Mostrar la primera pestaña por defecto
    showHCTab('patient-data');
    
    // Recalcular el tamaño del expander después de mostrar el formulario
    setTimeout(() => {
        recalculateHCExpanderHeight();
    }, 100);
}

// Editar paciente con historia clínica existente
async function editHCPatient(patient) {
    
    try {
        // Obtener datos del paciente desde el backend
        const response = await fetch(`/api/hc/patient-data/${selectedHCDatabase.id}/${patient.id}`);
        
        if (!response.ok) {
            showToast('Error cargando datos del paciente', 'error');
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Establecer el paciente seleccionado
            selectedHCPatient = patient;
            
            // Ocultar selector de pacientes y mostrar formulario
            document.getElementById('hcPatientSelector').style.display = 'none';
            document.getElementById('hcForm').style.display = 'block';
            
            // Mostrar información del paciente
            displayHCPatientInfo(patient);
            
            // Cargar datos existentes en el formulario
            loadHCPatientData(result.hc_data);
            
            // Mostrar la primera pestaña por defecto
            showHCTab('patient-data');
            
            // Recalcular el tamaño del expander después de mostrar el formulario
            setTimeout(() => {
                recalculateHCExpanderHeight();
            }, 100);
            
            showToast('Datos del paciente cargados para edición', 'success');
        } else {
            showToast('Error cargando datos del paciente', 'error');
        }
        
    } catch (error) {
        console.error('Error editando historia clínica:', error);
        showToast('Error cargando datos del paciente', 'error');
    }
}

// Mostrar información del paciente seleccionado
function displayHCPatientInfo(patient) {
    const patientInfoElement = document.getElementById('hcPatientInfo');
    if (patientInfoElement) {
        patientInfoElement.textContent = `Paciente ${patient.id}`;
    }
}

// Cargar datos existentes en el formulario - TODAS las secciones
function loadHCPatientData(completeHcData) {
    
    // Cargar Datos del Paciente
    if (completeHcData.datos_paciente) {
        loadHCPatientDataSection(completeHcData.datos_paciente);
    }
    
    // Cargar Datos del Tutor
    if (completeHcData.datos_tutor) {
        loadHCTutorDataSection(completeHcData.datos_tutor);
    }
    
    // Cargar Antecedentes Personales
    if (completeHcData.antecedentes_personales) {
        loadHCPersonalHistorySection(completeHcData.antecedentes_personales);
    }
    
    // Cargar Esquema de Vacunación
    if (completeHcData.esquema_vacunacion) {
        loadHCVaccinationSection(completeHcData.esquema_vacunacion);
    }
    
    // Cargar Desarrollo Psicomotor
    if (completeHcData.desarrollo_psicomotor) {
        loadHCPsychomotorSection(completeHcData.desarrollo_psicomotor);
    }
    
    // Cargar Antecedentes Heredofamiliares
    if (completeHcData.antecedentes_heredofamiliares) {
        loadHCFamilyHistorySection(completeHcData.antecedentes_heredofamiliares);
    }
    
    // Cargar Exploración Física
    if (completeHcData.exploracion_fisica) {
        loadHCPhysicalExamSection(completeHcData.exploracion_fisica);
    }
    
    // Cargar Diagnóstico Nutricional
    if (completeHcData.diagnostico_nutricional) {
        loadHCNutritionalDiagnosisSection(completeHcData.diagnostico_nutricional);
    }
    
    // Cargar Diagnóstico General
    if (completeHcData.diagnostico_general) {
        loadHCGeneralDiagnosisSection(completeHcData.diagnostico_general);
    }
    
    // Cargar Datos del Doctor
    if (completeHcData.datos_doctor) {
        loadHCDoctorDataSection(completeHcData.datos_doctor);
    }
}

// Cargar sección: Datos del Paciente
function loadHCPatientDataSection(data) {
    const fields = {
        'hcNombrePaciente': data.nombre_paciente,
        'hcNSS': data.nss,
        'hcIdPaciente': data.id_paciente,
        'hcFechaNacimiento': data.fecha_nacimiento,
        'hcDomicilioPrincipal': data.domicilio_principal,
        'hcDomicilioAlterno': data.domicilio_alterno,
        'hcNombreFamiliar': data.nombre_familiar,
        'hcTelefono': data.telefono,
        'hcCelular': data.celular,
        'hcCorreo': data.correo,
        'hcRealizoHC': data.realizo_hc,
        'hcFirmaMPSS': data.firma_mpss
    };
    
    Object.entries(fields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
    
    // Cargar radio buttons
    if (data.realizo_hc) {
        const radio = document.querySelector(`input[name="hcRealizoHC"][value="${data.realizo_hc}"]`);
        if (radio) radio.checked = true;
    }
    if (data.firma_mpss) {
        const radio = document.querySelector(`input[name="hcFirmaMPSS"][value="${data.firma_mpss}"]`);
        if (radio) radio.checked = true;
    }
}

// Cargar sección: Datos del Tutor
function loadHCTutorDataSection(data) {
    const textFields = {
        'hcTutorNombre': data.nombre,
        'hcTutorFechaNacimiento': data.fechaNacimiento,
        'hcTutorEdad': data.edad,
        'hcTutorLugarNacimiento': data.lugarNacimiento,
        'hcTutorOcupacionMadre': data.ocupacionMadre,
        'hcTutorOcupacionMadreOtro': data.ocupacionMadreOtro,
        'hcTutorTiempoOcupacionMadre': data.tiempoOcupacionMadre,
        'hcTutorEscolaridadMadreOtro': data.escolaridadMadreOtro,
        'hcTutorOcupacionPadre': data.ocupacionPadre,
        'hcTutorOcupacionPadreOtro': data.ocupacionPadreOtro,
        'hcTutorTiempoOcupacionPadre': data.tiempoOcupacionPadre,
        'hcTutorEscolaridadPadreOtro': data.escolaridadPadreOtro
    };
    
    Object.entries(textFields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
    
    // Cargar radio buttons
    if (data.sexo) {
        const radio = document.querySelector(`input[name="hcTutorSexo"][value="${data.sexo}"]`);
        if (radio) radio.checked = true;
    }
    if (data.estadoCivil) {
        const radio = document.querySelector(`input[name="hcTutorEstadoCivil"][value="${data.estadoCivil}"]`);
        if (radio) radio.checked = true;
    }
    if (data.escolaridadMadre) {
        const radio = document.querySelector(`input[name="hcTutorEscolaridadMadre"][value="${data.escolaridadMadre}"]`);
        if (radio) radio.checked = true;
    }
    if (data.escolaridadPadre) {
        const radio = document.querySelector(`input[name="hcTutorEscolaridadPadre"][value="${data.escolaridadPadre}"]`);
        if (radio) radio.checked = true;
    }
}

// Cargar sección: Antecedentes Personales
function loadHCPersonalHistorySection(data) {
    // Campos de texto
    const textFields = {
        'hcEmbarazoNumero': data.embarazoNumero,
        'hcSemanasGestacion': data.semanasGestacion,
        'hcSitioPartoOtro': data.sitioPartoOtro,
        'hcCesareaCausa': data.cesareaCausa,
        'hcPesoNacer': data.pesoNacer,
        'hcTallaNacer': data.tallaNacer,
        'hcRupturaHoras': data.rupturaHoras,
        'hcAnestesiaEspecifique': data.anestesiaEspecifique,
        'hcComplicacionesDetalle': data.complicacionesDetalle,
        'hcTamizPatologia': data.tamizPatologia,
        'hcTamizTratamientoDetalle': data.tamizTratamientoDetalle,
        'hcLactanciaDuracion': data.lactanciaDuracion,
        'hcAblactacion': data.ablactacion,
        'hcCarnesRojas': data.carnesRojas,
        'hcCarnesBlancas': data.carnesBlancas,
        'hcLeche': data.leche,
        'hcHuevo': data.huevo,
        'hcFrutas': data.frutas,
        'hcCereales': data.cereales,
        'hcVerduras': data.verduras,
        'hcLeguminosas': data.leguminosas,
        'hcRefrescos': data.refrescos,
        'hcAgua': data.agua,
        'hcFrituras': data.frituras,
        'hcDulces': data.dulces,
        'hcEmbutidos': data.embutidos,
        'hcDerivadosMaiz': data.derivadosMaiz,
        'hcFrecuenciaActividad': data.frecuenciaActividad
    };
    
    Object.entries(textFields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
    
    // Cargar radio buttons
    const radioFields = {
        'hcCursoNormal': data.cursoNormal,
        'hcTermino': data.termino,
        'hcSitioParto': data.sitioParto,
        'hcTipoParto': data.tipoParto,
        'hcRupturaMembrana': data.rupturaMembrana,
        'hcAnestesia': data.anestesia,
        'hcTamizNeonatal': data.tamizNeonatal,
        'hcTamizResultado': data.tamizResultado,
        'hcTamizTratamiento': data.tamizTratamiento,
        'hcLactanciaMaterna': data.lactanciaMaterna,
        'hcActividadFisica': data.actividadFisica,
        'hcTipoActividad': data.tipoActividad
    };
    
    Object.entries(radioFields).forEach(([fieldName, value]) => {
        if (value) {
            const radio = document.querySelector(`input[name="${fieldName}"][value="${value}"]`);
            if (radio) radio.checked = true;
        }
    });
    
    // Cargar checkboxes (complicaciones)
    if (data.complicaciones && Array.isArray(data.complicaciones)) {
        data.complicaciones.forEach(complicacion => {
            const checkbox = document.querySelector(`input[name="hcComplicaciones"][value="${complicacion}"]`);
            if (checkbox) checkbox.checked = true;
        });
    }
}

// Cargar sección: Esquema de Vacunación
function loadHCVaccinationSection(data) {
    // Mapeo de campos de vacunación (checkboxes)
    const vaccinationFields = {
        'bcgUnica': 'input[name="bcg-unica"]',
        'hepatitisBUnica': 'input[name="hepatitis-b-unica"]',
        'hexavalentePrimera': 'input[name="hexavalente-primera"]',
        'hexavalenteSegunda': 'input[name="hexavalente-segunda"]',
        'hexavalenteTercera': 'input[name="hexavalente-tercera"]',
        'hexavalenteRefuerzo': 'input[name="hexavalente-refuerzo"]',
        'dptRefuerzo': 'input[name="dpt-refuerzo"]',
        'rotavirusPrimera': 'input[name="rotavirus-primera"]',
        'rotavirusSegunda': 'input[name="rotavirus-segunda"]',
        'neumococicaPrimera': 'input[name="neumococica-primera"]',
        'neumococicaSegunda': 'input[name="neumococica-segunda"]',
        'srpPrimera': 'input[name="srp-primera"]',
        'srpSegunda': 'input[name="srp-segunda"]',
        'sabinPrimera': 'input[name="sabin-primera"]',
        'sabinSegunda': 'input[name="sabin-segunda"]',
        'sabinTercera': 'input[name="sabin-tercera"]',
        'sabinRefuerzo': 'input[name="sabin-refuerzo"]',
        'influenzaAnual': 'input[name="influenza-anual"]',
        'covidPrimera': 'input[name="covid-primera"]',
        'covidSegunda': 'input[name="covid-segunda"]',
        'covidRefuerzo': 'input[name="covid-refuerzo"]'
    };
    
    Object.entries(vaccinationFields).forEach(([key, selector]) => {
        const value = data[key];
        if (value !== null && value !== undefined) {
            const checkbox = document.querySelector(selector);
            if (checkbox) {
                checkbox.checked = value === true || value === 'true' || value === 1 || value === '1';
            }
        }
    });
}

// Cargar sección: Desarrollo Psicomotor
function loadHCPsychomotorSection(data) {
    const textFields = {
        'hcSiguioObjetos': data.siguioObjetos,
        'hcSonrio': data.sonrio,
        'hcSostuvoCabeza': data.sostuvoCabeza,
        'hcSeSento': data.seSento,
        'hcCamino': data.camino,
        'hcControlVesical': data.controlVesical,
        'hcControlAnal': data.controlAnal,
        'hcEscolaridadActual': data.escolaridadActual,
        'hcAnosReprobados': data.anosReprobados,
        'hcDatosAnormales': data.datosAnormales,
        'hcAnimalesDetalle': data.animalesDetalle,
        'hcToxicasDetalle': data.toxicasDetalle
    };
    
    Object.entries(textFields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
    
    // Radio buttons
    if (data.convivenciaAnimales) {
        const radio = document.querySelector(`input[name="hcConvivenciaAnimales"][value="${data.convivenciaAnimales}"]`);
        if (radio) radio.checked = true;
    }
    if (data.exposicionToxicas) {
        const radio = document.querySelector(`input[name="hcExposicionToxicas"][value="${data.exposicionToxicas}"]`);
        if (radio) radio.checked = true;
    }
}

/** Clona el cuerpo del formulario del hermano 1 a las columnas 2 y 3 (ids y names con sufijo). */
function initHCHermanosColumnsClone() {
    const srcBody = document.querySelector('#hcHermanosColWrap1 .hc-hermano-col-body');
    [2, 3].forEach((toIdx) => {
        const dst = document.getElementById('hcHermanosColWrap' + toIdx);
        if (!srcBody || !dst || dst.dataset.cloned === '1') return;
        let bodyHtml = srcBody.innerHTML;
        bodyHtml = bodyHtml.split('Hermanos_1').join('Hermanos_' + toIdx);
        bodyHtml = bodyHtml.replace(/_1(?=["'])/g, '_' + toIdx);
        dst.innerHTML =
            '<h6 class="hc-hermano-col-title">Hermano / Hermana ' +
            toIdx +
            '</h6><div class="hc-hermano-col-body">' +
            bodyHtml +
            '</div>';
        dst.dataset.cloned = '1';
    });
}

/** Muestra u oculta columnas según #hcNumeroHermanos (0–3). */
window.syncHermanosColumnsCount = function () {
    initHCHermanosColumnsClone();
    const inp = document.getElementById('hcNumeroHermanos');
    let n = parseInt(inp && inp.value, 10);
    if (isNaN(n)) n = 1;
    n = Math.min(3, Math.max(0, n));
    if (inp) inp.value = String(n);
    [1, 2, 3].forEach((i) => {
        const wrap = document.getElementById('hcHermanosColWrap' + i);
        if (wrap) wrap.style.display = n > 0 && i <= n ? '' : 'none';
    });
    recalculateHCExpanderHeight();
};

function normalizeHermanosPayload(data) {
    let list = Array.isArray(data.hermanos) ? data.hermanos.slice(0, 3) : [];
    if (
        list.length === 0 &&
        (data.edadHermanos ||
            data.diabetesHermanos ||
            data.obesidadHermanos ||
            data.hipertensionHermanos ||
            data.otrasPatologiasHermanos ||
            (data.diabetesTipoHermanos && data.diabetesTipoHermanos.length))
    ) {
        list.push({
            edadHermanos: data.edadHermanos,
            diabetesHermanos: data.diabetesHermanos,
            diabetesTipoHermanos: data.diabetesTipoHermanos || [],
            tratamientoDiabetesHermanos: data.tratamientoDiabetesHermanos,
            obesidadHermanos: data.obesidadHermanos,
            pesoObesidadHermanos: data.pesoObesidadHermanos,
            estaturaObesidadHermanos: data.estaturaObesidadHermanos,
            imcObesidadHermanos: data.imcObesidadHermanos,
            actividadFisicaObesidadHermanos: data.actividadFisicaObesidadHermanos,
            recibeTratamientoObesidadHermanos: data.recibeTratamientoObesidadHermanos,
            tratamientoObesidadHermanos: data.tratamientoObesidadHermanos,
            sindromeMetabolicoHermanos: data.sindromeMetabolicoHermanos,
            sindromePatologiasHermanos: data.sindromePatologiasHermanos || [],
            tratamientoSindromeHermanos: data.tratamientoSindromeHermanos,
            hipertensionHermanos: data.hipertensionHermanos,
            tratamientoHipertensionHermanos: data.tratamientoHipertensionHermanos,
            hipercolesterolemiaHermanos: data.hipercolesterolemiaHermanos,
            tratamientoHipercolesterolemiaHermanos: data.tratamientoHipercolesterolemiaHermanos,
            hipertrigliceridemiaHermanos: data.hipertrigliceridemiaHermanos,
            tratamientoHipertrigliceridemiaHermanos: data.tratamientoHipertrigliceridemiaHermanos,
            otrasPatologiasHermanos: data.otrasPatologiasHermanos
        });
    }
    while (list.length < 3) list.push({});
    return list.slice(0, 3);
}

function loadHermanosSlot(idx, h) {
    const hdata = h && typeof h === 'object' ? h : {};
    const ft = 'Hermanos_' + idx;
    const sfx = '_' + idx;

    const edadEl = document.getElementById('hcEdadHermanos' + sfx);
    if (edadEl && hdata.edadHermanos != null && hdata.edadHermanos !== '') edadEl.value = hdata.edadHermanos;

    [
        ['hcTratamientoDiabetesHermanos', 'tratamientoDiabetesHermanos'],
        ['hcPesoObesidadHermanos', 'pesoObesidadHermanos'],
        ['hcEstaturaObesidadHermanos', 'estaturaObesidadHermanos'],
        ['hcIMCObesidadHermanos', 'imcObesidadHermanos'],
        ['hcTratamientoObesidadHermanos', 'tratamientoObesidadHermanos'],
        ['hcTratamientoSindromeHermanos', 'tratamientoSindromeHermanos'],
        ['hcTratamientoHipertensionHermanos', 'tratamientoHipertensionHermanos'],
        ['hcTratamientoHipercolesterolemiaHermanos', 'tratamientoHipercolesterolemiaHermanos'],
        ['hcTratamientoHipertrigliceridemiaHermanos', 'tratamientoHipertrigliceridemiaHermanos'],
        ['hcOtrasPatologiasHermanos', 'otrasPatologiasHermanos']
    ].forEach(([idBase, key]) => {
        const el = document.getElementById(idBase + sfx);
        const v = hdata[key];
        if (el && v != null && v !== '') el.value = v;
    });

    if (hdata.diabetesHermanos) {
        const value = hdata.diabetesHermanos;
        const radio = document.querySelector(`input[name="hcDiabetes${ft}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
            toggleDiabetesDetails(ft);
            if (value === 'Si') {
                setTimeout(() => {
                    if (hdata.diabetesTipoHermanos && Array.isArray(hdata.diabetesTipoHermanos)) {
                        hdata.diabetesTipoHermanos.forEach((tipo) => {
                            const checkbox = document.querySelector(`input[name="hcDiabetesTipo${ft}"][value="${tipo}"]`);
                            if (checkbox) checkbox.checked = true;
                        });
                        toggleDiabetesTreatment(ft);
                        const tf = document.getElementById('hcTratamientoDiabetesHermanos' + sfx);
                        if (tf && hdata.tratamientoDiabetesHermanos) tf.value = hdata.tratamientoDiabetesHermanos;
                    }
                }, 100);
            }
        }
    }

    if (hdata.obesidadHermanos) {
        const radio = document.querySelector(`input[name="hcObesidad${ft}"][value="${hdata.obesidadHermanos}"]`);
        if (radio) {
            radio.checked = true;
            toggleObesidadDetails(ft);
            if (hdata.actividadFisicaObesidadHermanos) {
                const actividad = document.querySelector(
                    `input[name="hcActividadFisicaObesidad${ft}"][value="${hdata.actividadFisicaObesidadHermanos}"]`
                );
                if (actividad) actividad.checked = true;
            }
            if (hdata.recibeTratamientoObesidadHermanos) {
                const tr = document.querySelector(
                    `input[name="hcRecibeTratamientoObesidad${ft}"][value="${hdata.recibeTratamientoObesidadHermanos}"]`
                );
                if (tr) tr.checked = true;
                toggleObesidadTreatment(ft);
            }
            calculateObesidadIMC(ft);
        }
    }

    if (hdata.sindromeMetabolicoHermanos) {
        const value = hdata.sindromeMetabolicoHermanos;
        const radio = document.querySelector(`input[name="hcSindromeMetabolico${ft}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
            toggleSindromeMetabolicoDetails(ft);
            if (value === 'Si') {
                setTimeout(() => {
                    if (hdata.sindromePatologiasHermanos && Array.isArray(hdata.sindromePatologiasHermanos)) {
                        hdata.sindromePatologiasHermanos.forEach((patologia) => {
                            const checkbox = document.querySelector(`input[name="hcSindromePatologias${ft}"][value="${patologia}"]`);
                            if (checkbox) checkbox.checked = true;
                        });
                        toggleSindromeTreatment(ft);
                        const tf = document.getElementById('hcTratamientoSindromeHermanos' + sfx);
                        if (tf && hdata.tratamientoSindromeHermanos) tf.value = hdata.tratamientoSindromeHermanos;
                    }
                }, 100);
            }
        }
    }

    if (hdata.hipertensionHermanos) {
        const value = hdata.hipertensionHermanos;
        const radio = document.querySelector(`input[name="hcHipertension${ft}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
            if (value === 'Si') {
                toggleHipertensionTreatment(ft);
                setTimeout(() => {
                    const tratamientoRadio = document.querySelector(
                        `input[name="hcTratamientoHipertension${ft}"][value="${hdata.tratamientoHipertensionHermanos}"]`
                    );
                    if (tratamientoRadio) tratamientoRadio.checked = true;
                }, 100);
            }
        }
    }

    if (hdata.hipercolesterolemiaHermanos) {
        const value = hdata.hipercolesterolemiaHermanos;
        const radio = document.querySelector(`input[name="hcHipercolesterolemia${ft}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
            if (value === 'Si') {
                toggleHipercolesterolemiaTreatment(ft);
                setTimeout(() => {
                    const tratamientoRadio = document.querySelector(
                        `input[name="hcTratamientoHipercolesterolemia${ft}"][value="${hdata.tratamientoHipercolesterolemiaHermanos}"]`
                    );
                    if (tratamientoRadio) tratamientoRadio.checked = true;
                }, 100);
            }
        }
    }

    if (hdata.hipertrigliceridemiaHermanos) {
        const value = hdata.hipertrigliceridemiaHermanos;
        const radio = document.querySelector(`input[name="hcHipertrigliceridemia${ft}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
            if (value === 'Si') {
                toggleHipertrigliceridemiaTreatment(ft);
                setTimeout(() => {
                    const tratamientoRadio = document.querySelector(
                        `input[name="hcTratamientoHipertrigliceridemia${ft}"][value="${hdata.tratamientoHipertrigliceridemiaHermanos}"]`
                    );
                    if (tratamientoRadio) tratamientoRadio.checked = true;
                }, 100);
            }
        }
    }
}

function resetHermanosColumnsForLoad() {
    initHCHermanosColumnsClone();
    [1, 2, 3].forEach((idx) => {
        const ft = 'Hermanos_' + idx;
        const wrap = document.getElementById('hcHermanosColWrap' + idx);
        if (!wrap) return;
        wrap.querySelectorAll('input').forEach((inp) => {
            if (inp.type === 'radio' || inp.type === 'checkbox') inp.checked = false;
            else inp.value = '';
        });
        [
            'diabetesDetails' + ft,
            'diabetesTreatment' + ft,
            'obesidadDetails' + ft,
            'obesidadTreatment' + ft,
            'sindromeMetabolicoDetails' + ft,
            'sindromeTreatment' + ft,
            'hipertensionTreatment' + ft,
            'hipercolesterolemiaTreatment' + ft,
            'hipertrigliceridemiaTreatment' + ft
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        updateObesidadImcVisual(ft, null);
    });
}

function collectHermanosSlotsForSave() {
    initHCHermanosColumnsClone();
    const numInp = document.getElementById('hcNumeroHermanos');
    let n = parseInt(numInp && numInp.value, 10);
    if (isNaN(n)) n = 1;
    n = Math.min(3, Math.max(0, n));
    const hermanos = [];
    for (let i = 1; i <= n; i++) {
        const ft = 'Hermanos_' + i;
        const sfx = '_' + i;
        hermanos.push({
            edadHermanos: document.getElementById('hcEdadHermanos' + sfx) ? document.getElementById('hcEdadHermanos' + sfx).value : '',
            diabetesHermanos: document.querySelector(`input[name="hcDiabetes${ft}"]:checked`)?.value,
            diabetesTipoHermanos: Array.from(document.querySelectorAll(`input[name="hcDiabetesTipo${ft}"]:checked`)).map((cb) => cb.value),
            tratamientoDiabetesHermanos: document.getElementById('hcTratamientoDiabetesHermanos' + sfx)
                ? document.getElementById('hcTratamientoDiabetesHermanos' + sfx).value
                : '',
            obesidadHermanos: document.querySelector(`input[name="hcObesidad${ft}"]:checked`)?.value,
            pesoObesidadHermanos: document.getElementById('hcPesoObesidadHermanos' + sfx)
                ? document.getElementById('hcPesoObesidadHermanos' + sfx).value
                : '',
            estaturaObesidadHermanos: document.getElementById('hcEstaturaObesidadHermanos' + sfx)
                ? document.getElementById('hcEstaturaObesidadHermanos' + sfx).value
                : '',
            imcObesidadHermanos: document.getElementById('hcIMCObesidadHermanos' + sfx)
                ? document.getElementById('hcIMCObesidadHermanos' + sfx).value
                : '',
            actividadFisicaObesidadHermanos: document.querySelector(`input[name="hcActividadFisicaObesidad${ft}"]:checked`)?.value,
            recibeTratamientoObesidadHermanos: document.querySelector(`input[name="hcRecibeTratamientoObesidad${ft}"]:checked`)?.value,
            tratamientoObesidadHermanos: document.getElementById('hcTratamientoObesidadHermanos' + sfx)
                ? document.getElementById('hcTratamientoObesidadHermanos' + sfx).value
                : '',
            sindromeMetabolicoHermanos: document.querySelector(`input[name="hcSindromeMetabolico${ft}"]:checked`)?.value,
            sindromePatologiasHermanos: Array.from(document.querySelectorAll(`input[name="hcSindromePatologias${ft}"]:checked`)).map((cb) => cb.value),
            tratamientoSindromeHermanos: document.getElementById('hcTratamientoSindromeHermanos' + sfx)
                ? document.getElementById('hcTratamientoSindromeHermanos' + sfx).value
                : '',
            hipertensionHermanos: document.querySelector(`input[name="hcHipertension${ft}"]:checked`)?.value,
            tratamientoHipertensionHermanos: document.querySelector(`input[name="hcTratamientoHipertension${ft}"]:checked`)?.value,
            hipercolesterolemiaHermanos: document.querySelector(`input[name="hcHipercolesterolemia${ft}"]:checked`)?.value,
            tratamientoHipercolesterolemiaHermanos: document.querySelector(`input[name="hcTratamientoHipercolesterolemia${ft}"]:checked`)?.value,
            hipertrigliceridemiaHermanos: document.querySelector(`input[name="hcHipertrigliceridemia${ft}"]:checked`)?.value,
            tratamientoHipertrigliceridemiaHermanos: document.querySelector(`input[name="hcTratamientoHipertrigliceridemia${ft}"]:checked`)?.value,
            otrasPatologiasHermanos: document.getElementById('hcOtrasPatologiasHermanos' + sfx)
                ? document.getElementById('hcOtrasPatologiasHermanos' + sfx).value
                : ''
        });
    }
    const h0 = hermanos[0] || {};
    return {
        numeroHermanos: String(n),
        hermanos,
        edadHermanos: h0.edadHermanos || '',
        diabetesHermanos: h0.diabetesHermanos,
        diabetesTipoHermanos: h0.diabetesTipoHermanos || [],
        tratamientoDiabetesHermanos: h0.tratamientoDiabetesHermanos || '',
        obesidadHermanos: h0.obesidadHermanos,
        pesoObesidadHermanos: h0.pesoObesidadHermanos || '',
        estaturaObesidadHermanos: h0.estaturaObesidadHermanos || '',
        imcObesidadHermanos: h0.imcObesidadHermanos || '',
        actividadFisicaObesidadHermanos: h0.actividadFisicaObesidadHermanos,
        recibeTratamientoObesidadHermanos: h0.recibeTratamientoObesidadHermanos,
        tratamientoObesidadHermanos: h0.tratamientoObesidadHermanos || '',
        sindromeMetabolicoHermanos: h0.sindromeMetabolicoHermanos,
        sindromePatologiasHermanos: h0.sindromePatologiasHermanos || [],
        tratamientoSindromeHermanos: h0.tratamientoSindromeHermanos || '',
        hipertensionHermanos: h0.hipertensionHermanos,
        tratamientoHipertensionHermanos: h0.tratamientoHipertensionHermanos,
        hipercolesterolemiaHermanos: h0.hipercolesterolemiaHermanos,
        tratamientoHipercolesterolemiaHermanos: h0.tratamientoHipercolesterolemiaHermanos,
        hipertrigliceridemiaHermanos: h0.hipertrigliceridemiaHermanos,
        tratamientoHipertrigliceridemiaHermanos: h0.tratamientoHipertrigliceridemiaHermanos,
        otrasPatologiasHermanos: h0.otrasPatologiasHermanos || ''
    };
}

// Cargar sección: Antecedentes Heredofamiliares
function loadHCFamilyHistorySection(data) {
    // Esta sección es muy extensa, cargamos los campos principales
    const textFields = {
        'hcEdadMaterna': data.edadMaterna,
        'hcTratamientoDiabetesMaterna': data.tratamientoDiabetesMaterna,
        'hcTratamientoPreeclampsiaMaterna': data.tratamientoPreeclampsiaMaterna,
        'hcTratamientoInfeccionesMaterna': data.tratamientoInfeccionesMaterna,
        'hcPesoEmbarazoMaterna': data.pesoEmbarazoMaterna,
        'hcPesoObesidadMaterna': data.pesoObesidadMaterna,
        'hcEstaturaObesidadMaterna': data.estaturaObesidadMaterna,
        'hcIMCObesidadMaterna': data.imcObesidadMaterna,
        'hcTratamientoObesidadMaterna': data.tratamientoObesidadMaterna,
        'hcTratamientoSindromeMaterna': data.tratamientoSindromeMaterna,
        'hcTratamientoHipertensionMaterna': data.tratamientoHipertensionMaterna,
        'hcTratamientoHipercolesterolemiaMaterna': data.tratamientoHipercolesterolemiaMaterna,
        'hcTratamientoHipertrigliceridemiaMaterna': data.tratamientoHipertrigliceridemiaMaterna,
        'hcOtrasPatologiasMaterna': data.otrasPatologiasMaterna,
        'hcEdadPaterna': data.edadPaterna,
        'hcTratamientoDiabetesPaterna': data.tratamientoDiabetesPaterna,
        'hcPesoObesidadPaterna': data.pesoObesidadPaterna,
        'hcEstaturaObesidadPaterna': data.estaturaObesidadPaterna,
        'hcIMCObesidadPaterna': data.imcObesidadPaterna,
        'hcTratamientoObesidadPaterna': data.tratamientoObesidadPaterna,
        'hcTratamientoSindromePaterna': data.tratamientoSindromePaterna,
        'hcTratamientoHipertensionPaterna': data.tratamientoHipertensionPaterna,
        'hcTratamientoHipercolesterolemiaPaterna': data.tratamientoHipercolesterolemiaPaterna,
        'hcTratamientoHipertrigliceridemiaPaterna': data.tratamientoHipertrigliceridemiaPaterna,
        'hcOtrasPatologiasPaterna': data.otrasPatologiasPaterna
    };
    
    Object.entries(textFields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
    
    // Radio buttons y checkboxes - se cargarán según la estructura
    // Por ahora, cargamos los principales radio buttons
    const radioFields = [
        'diabetesMaterna', 'preeclampsiaMaterna', 'infeccionesEmbarazoMaterna', 'obesidadMaterna',
        'sindromeMetabolicoMaterna', 'hipertensionMaterna', 'hipercolesterolemiaMaterna', 'hipertrigliceridemiaMaterna',
        'diabetesPaterna', 'obesidadPaterna', 'sindromeMetabolicoPaterna', 'hipertensionPaterna',
        'hipercolesterolemiaPaterna', 'hipertrigliceridemiaPaterna'
    ];
    
    // Cargar radio buttons y activar campos dinámicos (hermanos: columnas 1–3, aparte)
    const familyTypes = ['Materna', 'Paterna'];
    
    familyTypes.forEach(familyType => {
        // Diabetes
        if (data[`diabetes${familyType}`]) {
            const value = data[`diabetes${familyType}`];
            const radio = document.querySelector(`input[name="hcDiabetes${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                toggleDiabetesDetails(familyType);
                if (value === 'Si') {
                    // Cargar tipo de diabetes (checkboxes)
                    setTimeout(() => {
                        if (data[`diabetesTipo${familyType}`] && Array.isArray(data[`diabetesTipo${familyType}`])) {
                            data[`diabetesTipo${familyType}`].forEach(tipo => {
                                const checkbox = document.querySelector(`input[name="hcDiabetesTipo${familyType}"][value="${tipo}"]`);
                                if (checkbox) checkbox.checked = true;
                            });
                            toggleDiabetesTreatment(familyType);
                            // Cargar tratamiento después de activar
                            const tratamientoField = document.getElementById(`hcTratamientoDiabetes${familyType}`);
                            if (tratamientoField && data[`tratamientoDiabetes${familyType}`]) {
                                tratamientoField.value = data[`tratamientoDiabetes${familyType}`];
                            }
                        }
                    }, 100);
                }
            }
        }
        
        // Preeclampsia (solo Materna)
        if (familyType === 'Materna' && data.preeclampsiaMaterna) {
            const value = data.preeclampsiaMaterna;
            const radio = document.querySelector(`input[name="hcPreeclampsia${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                if (value === 'Si') {
                    togglePreeclampsiaTreatment(familyType);
                    setTimeout(() => {
                        const tratamientoField = document.getElementById(`hcTratamientoPreeclampsia${familyType}`);
                        if (tratamientoField && data.tratamientoPreeclampsiaMaterna) {
                            tratamientoField.value = data.tratamientoPreeclampsiaMaterna;
                        }
                    }, 100);
                }
            }
        }
        
        // Infecciones durante embarazo (solo Materna)
        if (familyType === 'Materna' && data.infeccionesEmbarazoMaterna) {
            const value = data.infeccionesEmbarazoMaterna;
            const radio = document.querySelector(`input[name="hcInfeccionesEmbarazo${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                if (value === 'Si') {
                    toggleInfeccionesTreatment(familyType);
                    setTimeout(() => {
                        const tratamientoField = document.getElementById(`hcTratamientoInfecciones${familyType}`);
                        if (tratamientoField && data.tratamientoInfeccionesMaterna) {
                            tratamientoField.value = data.tratamientoInfeccionesMaterna;
                        }
                    }, 100);
                }
            }
        }
        
        // Obesidad
        if (data[`obesidad${familyType}`]) {
            const value = data[`obesidad${familyType}`];
            const radio = document.querySelector(`input[name="hcObesidad${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                toggleObesidadDetails(familyType);
                if (data[`actividadFisicaObesidad${familyType}`]) {
                    const actividad = document.querySelector(
                        `input[name="hcActividadFisicaObesidad${familyType}"][value="${data[`actividadFisicaObesidad${familyType}`]}"]`
                    );
                    if (actividad) actividad.checked = true;
                }
                if (data[`recibeTratamientoObesidad${familyType}`]) {
                    const tr = document.querySelector(
                        `input[name="hcRecibeTratamientoObesidad${familyType}"][value="${data[`recibeTratamientoObesidad${familyType}`]}"]`
                    );
                    if (tr) tr.checked = true;
                    toggleObesidadTreatment(familyType);
                }
                calculateObesidadIMC(familyType);
            }
        }
        
        // Síndrome Metabólico
        if (data[`sindromeMetabolico${familyType}`]) {
            const value = data[`sindromeMetabolico${familyType}`];
            const radio = document.querySelector(`input[name="hcSindromeMetabolico${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                toggleSindromeMetabolicoDetails(familyType);
                if (value === 'Si') {
                    setTimeout(() => {
                        // Cargar patologías del síndrome (checkboxes)
                        if (data[`sindromePatologias${familyType}`] && Array.isArray(data[`sindromePatologias${familyType}`])) {
                            data[`sindromePatologias${familyType}`].forEach(patologia => {
                                const checkbox = document.querySelector(`input[name="hcSindromePatologias${familyType}"][value="${patologia}"]`);
                                if (checkbox) checkbox.checked = true;
                            });
                            toggleSindromeTreatment(familyType);
                            // Cargar tratamiento después de activar
                            const tratamientoField = document.getElementById(`hcTratamientoSindrome${familyType}`);
                            if (tratamientoField && data[`tratamientoSindrome${familyType}`]) {
                                tratamientoField.value = data[`tratamientoSindrome${familyType}`];
                            }
                        }
                    }, 100);
                }
            }
        }
        
        // Hipertensión
        if (data[`hipertension${familyType}`]) {
            const value = data[`hipertension${familyType}`];
            const radio = document.querySelector(`input[name="hcHipertension${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                if (value === 'Si') {
                    toggleHipertensionTreatment(familyType);
                    setTimeout(() => {
                        const tratamientoRadio = document.querySelector(`input[name="hcTratamientoHipertension${familyType}"][value="${data[`tratamientoHipertension${familyType}`]}"]`);
                        if (tratamientoRadio) tratamientoRadio.checked = true;
                    }, 100);
                }
            }
        }
        
        // Hipercolesterolemia
        if (data[`hipercolesterolemia${familyType}`]) {
            const value = data[`hipercolesterolemia${familyType}`];
            const radio = document.querySelector(`input[name="hcHipercolesterolemia${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                if (value === 'Si') {
                    toggleHipercolesterolemiaTreatment(familyType);
                    setTimeout(() => {
                        const tratamientoRadio = document.querySelector(`input[name="hcTratamientoHipercolesterolemia${familyType}"][value="${data[`tratamientoHipercolesterolemia${familyType}`]}"]`);
                        if (tratamientoRadio) tratamientoRadio.checked = true;
                    }, 100);
                }
            }
        }
        
        // Hipertrigliceridemia
        if (data[`hipertrigliceridemia${familyType}`]) {
            const value = data[`hipertrigliceridemia${familyType}`];
            const radio = document.querySelector(`input[name="hcHipertrigliceridemia${familyType}"][value="${value}"]`);
            if (radio) {
                radio.checked = true;
                if (value === 'Si') {
                    toggleHipertrigliceridemiaTreatment(familyType);
                    setTimeout(() => {
                        const tratamientoRadio = document.querySelector(`input[name="hcTratamientoHipertrigliceridemia${familyType}"][value="${data[`tratamientoHipertrigliceridemia${familyType}`]}"]`);
                        if (tratamientoRadio) tratamientoRadio.checked = true;
                    }, 100);
                }
            }
        }
    });

    resetHermanosColumnsForLoad();
    const hermanosList = normalizeHermanosPayload(data);
    let nH = parseInt(data.numeroHermanos, 10);
    if (isNaN(nH)) {
        const hasData = (h) =>
            h &&
            (['edadHermanos', 'diabetesHermanos', 'obesidadHermanos', 'hipertensionHermanos', 'otrasPatologiasHermanos'].some(
                (k) => h[k] != null && String(h[k]).trim() !== ''
            ) ||
                (Array.isArray(h.diabetesTipoHermanos) && h.diabetesTipoHermanos.length) ||
                (Array.isArray(h.sindromePatologiasHermanos) && h.sindromePatologiasHermanos.length));
        const count = hermanosList.filter(hasData).length;
        nH = count > 0 ? Math.min(3, Math.max(1, count)) : 1;
    }
    nH = Math.min(3, Math.max(0, nH));
    const numEl = document.getElementById('hcNumeroHermanos');
    if (numEl) numEl.value = String(nH);
    [1, 2, 3].forEach((i) => loadHermanosSlot(i, hermanosList[i - 1] || {}));
    syncHermanosColumnsCount();
}

// Cargar sección: Exploración Física
function loadHCPhysicalExamSection(data) {
    const fields = {
        'hcPeso': data.peso,
        'hcTalla': data.talla,
        'hcPerimetroCefalico': data.perimetroCefalico,
        'hcPerimetroBraquial': data.perimetroBraquial,
        'hcFrecuenciaCardiaca': data.frecuenciaCardiaca,
        'hcFrecuenciaRespiratoria': data.frecuenciaRespiratoria,
        'hcTemperatura': data.temperatura,
        'hcOximetriaPulso': data.oximetriaPulso
    };
    
    Object.entries(fields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
}

// Cargar sección: Diagnóstico Nutricional
function loadHCNutritionalDiagnosisSection(data) {
    // Radio button para toma de muestra
    if (data.tomaMuestra) {
        const radio = document.querySelector(`input[name="hcTomaMuestra"][value="${data.tomaMuestra}"]`);
        if (radio) {
            radio.checked = true;
            // Activar campos dinámicos si es "Sí"
            if (data.tomaMuestra === 'Si') {
                toggleTomaMuestraDetails();
            }
        }
    }
    
    // Campos de texto
    const fields = {
        'hcFechaTomaMuestra': data.fechaTomaMuestra,
        'hcGlucosaTamiz': data.glucosaTamiz,
        'hcColesterolTamiz': data.colesterolTamiz,
        'hcTrigliceridosTamiz': data.trigliceridosTamiz,
        'hcHDLTamiz': data.hdlTamiz
    };
    
    Object.entries(fields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
}

// Cargar sección: Diagnóstico General
function loadHCGeneralDiagnosisSection(data) {
    const fields = {
        'hcDiagnosticosPrevios': data.diagnosticosPrevios,
        'hcDiagnosticosActuales': data.diagnosticosActuales
    };
    
    Object.entries(fields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
}

// Cargar sección: Datos del Doctor
function loadHCDoctorDataSection(data) {
    const fields = {
        'hcMedicoRealizo': data.medicoRealizo,
        'hcMedicoReviso': data.medicoReviso
    };
    
    Object.entries(fields).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined && value !== '') {
            field.value = value;
        }
    });
}

// Limpiar formulario de Historia Clínica - Solo Datos del Paciente
function resetHCForm() {
    const fields = [
        'hcNombrePaciente', 'hcNSS', 'hcIdPaciente', 'hcFechaNacimiento', 'hcDomicilioPrincipal',
        'hcDomicilioAlterno', 'hcNombreFamiliar', 'hcTelefono', 'hcCelular',
        'hcCorreo', 'hcRealizoHC', 'hcFirmaMPSS'
    ];
    
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = '';
        }
    });
    
    // Limpiar radio buttons
    document.querySelectorAll('input[name="hcRealizoHC"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcFirmaMPSS"]').forEach(radio => radio.checked = false);
}

// Limpiar TODAS las secciones del formulario de Historia Clínica
function resetHCFormComplete() {
    // Limpiar Datos del Paciente
    resetHCForm();
    
    // Limpiar Datos del Tutor
    const tutorFields = [
        'hcTutorNombre', 'hcTutorFechaNacimiento', 'hcTutorEdad', 'hcTutorLugarNacimiento',
        'hcTutorOcupacionMadre', 'hcTutorOcupacionMadreOtro', 'hcTutorTiempoOcupacionMadre',
        'hcTutorEscolaridadMadreOtro', 'hcTutorOcupacionPadre', 'hcTutorOcupacionPadreOtro',
        'hcTutorTiempoOcupacionPadre', 'hcTutorEscolaridadPadreOtro'
    ];
    tutorFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    document.querySelectorAll('input[name="hcTutorSexo"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTutorEstadoCivil"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTutorEscolaridadMadre"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTutorEscolaridadPadre"]').forEach(radio => radio.checked = false);
    
    // Limpiar Antecedentes Personales
    const personalFields = [
        'hcEmbarazoNumero', 'hcSemanasGestacion', 'hcSitioPartoOtro', 'hcCesareaCausa',
        'hcPesoNacer', 'hcTallaNacer', 'hcRupturaHoras', 'hcAnestesiaEspecifique',
        'hcComplicacionesDetalle', 'hcTamizPatologia', 'hcTamizTratamientoDetalle',
        'hcLactanciaDuracion', 'hcAblactacion', 'hcCarnesRojas', 'hcCarnesBlancas',
        'hcLeche', 'hcHuevo', 'hcFrutas', 'hcCereales', 'hcVerduras', 'hcLeguminosas',
        'hcRefrescos', 'hcAgua', 'hcFrituras', 'hcDulces', 'hcEmbutidos', 'hcDerivadosMaiz',
        'hcFrecuenciaActividad'
    ];
    personalFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    document.querySelectorAll('input[name="hcCursoNormal"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTermino"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcSitioParto"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTipoParto"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcRupturaMembrana"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcAnestesia"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcComplicaciones"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="hcTamizNeonatal"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTamizResultado"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTamizTratamiento"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcLactanciaMaterna"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcActividadFisica"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcTipoActividad"]').forEach(radio => radio.checked = false);
    
    // Limpiar Esquema de Vacunación
    document.querySelectorAll('input[name="bcg-unica"], input[name="hepatitis-b-unica"], input[name="hexavalente-primera"], input[name="hexavalente-segunda"], input[name="hexavalente-tercera"], input[name="hexavalente-refuerzo"], input[name="dpt-refuerzo"], input[name="rotavirus-primera"], input[name="rotavirus-segunda"], input[name="neumococica-primera"], input[name="neumococica-segunda"], input[name="srp-primera"], input[name="srp-segunda"], input[name="sabin-primera"], input[name="sabin-segunda"], input[name="sabin-tercera"], input[name="sabin-refuerzo"], input[name="influenza-anual"], input[name="covid-primera"], input[name="covid-segunda"], input[name="covid-refuerzo"]').forEach(cb => cb.checked = false);
    
    // Limpiar Desarrollo Psicomotor
    const psychomotorFields = [
        'hcSiguioObjetos', 'hcSonrio', 'hcSostuvoCabeza', 'hcSeSento', 'hcCamino',
        'hcControlVesical', 'hcControlAnal', 'hcEscolaridadActual', 'hcAnosReprobados',
        'hcDatosAnormales', 'hcAnimalesDetalle', 'hcToxicasDetalle'
    ];
    psychomotorFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    document.querySelectorAll('input[name="hcConvivenciaAnimales"]').forEach(radio => radio.checked = false);
    document.querySelectorAll('input[name="hcExposicionToxicas"]').forEach(radio => radio.checked = false);
    
    // Limpiar Antecedentes Heredofamiliares (muy extenso, limpiar todos los campos)
    const familyFields = [
        'hcEdadMaterna', 'hcTratamientoDiabetesMaterna', 'hcTratamientoPreeclampsiaMaterna',
        'hcTratamientoInfeccionesMaterna', 'hcPesoEmbarazoMaterna', 'hcPesoObesidadMaterna',
        'hcEstaturaObesidadMaterna', 'hcIMCObesidadMaterna', 'hcTratamientoObesidadMaterna', 'hcTratamientoSindromeMaterna',
        'hcTratamientoHipertensionMaterna', 'hcTratamientoHipercolesterolemiaMaterna',
        'hcTratamientoHipertrigliceridemiaMaterna', 'hcOtrasPatologiasMaterna',
        'hcEdadPaterna', 'hcTratamientoDiabetesPaterna', 'hcPesoObesidadPaterna',
        'hcEstaturaObesidadPaterna', 'hcIMCObesidadPaterna', 'hcTratamientoObesidadPaterna', 'hcTratamientoSindromePaterna',
        'hcTratamientoHipertensionPaterna', 'hcTratamientoHipercolesterolemiaPaterna',
        'hcTratamientoHipertrigliceridemiaPaterna', 'hcOtrasPatologiasPaterna',
        'hcEdadHermanos_1', 'hcTratamientoDiabetesHermanos_1', 'hcPesoObesidadHermanos_1',
        'hcEstaturaObesidadHermanos_1', 'hcIMCObesidadHermanos_1', 'hcTratamientoObesidadHermanos_1', 'hcTratamientoSindromeHermanos_1',
        'hcTratamientoHipertensionHermanos_1', 'hcTratamientoHipercolesterolemiaHermanos_1',
        'hcTratamientoHipertrigliceridemiaHermanos_1', 'hcOtrasPatologiasHermanos_1',
        'hcEdadHermanos_2', 'hcTratamientoDiabetesHermanos_2', 'hcPesoObesidadHermanos_2',
        'hcEstaturaObesidadHermanos_2', 'hcIMCObesidadHermanos_2', 'hcTratamientoObesidadHermanos_2', 'hcTratamientoSindromeHermanos_2',
        'hcTratamientoHipertensionHermanos_2', 'hcTratamientoHipercolesterolemiaHermanos_2',
        'hcTratamientoHipertrigliceridemiaHermanos_2', 'hcOtrasPatologiasHermanos_2',
        'hcEdadHermanos_3', 'hcTratamientoDiabetesHermanos_3', 'hcPesoObesidadHermanos_3',
        'hcEstaturaObesidadHermanos_3', 'hcIMCObesidadHermanos_3', 'hcTratamientoObesidadHermanos_3', 'hcTratamientoSindromeHermanos_3',
        'hcTratamientoHipertensionHermanos_3', 'hcTratamientoHipercolesterolemiaHermanos_3',
        'hcTratamientoHipertrigliceridemiaHermanos_3', 'hcOtrasPatologiasHermanos_3'
    ];
    familyFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    // Limpiar todos los radio buttons y checkboxes de antecedentes heredofamiliares
    const familyTypes = ['Materna', 'Paterna', 'Hermanos_1', 'Hermanos_2', 'Hermanos_3'];
    familyTypes.forEach(type => {
        document.querySelectorAll(`input[name="hcDiabetes${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcDiabetesTipo${type}"]`).forEach(cb => cb.checked = false);
        document.querySelectorAll(`input[name="hcPreeclampsia${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcInfeccionesEmbarazo${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcObesidad${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcActividadFisicaObesidad${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcRecibeTratamientoObesidad${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcSindromeMetabolico${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcSindromePatologias${type}"]`).forEach(cb => cb.checked = false);
        document.querySelectorAll(`input[name="hcHipertension${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcTratamientoHipertension${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcHipercolesterolemia${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcTratamientoHipercolesterolemia${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcHipertrigliceridemia${type}"]`).forEach(radio => radio.checked = false);
        document.querySelectorAll(`input[name="hcTratamientoHipertrigliceridemia${type}"]`).forEach(radio => radio.checked = false);
    });
    // Ocultar todos los campos dinámicos
    familyTypes.forEach(type => {
        const detailsDiv = document.getElementById(`diabetesDetails${type}`);
        if (detailsDiv) detailsDiv.style.display = 'none';
        const treatmentDiv = document.getElementById(`diabetesTreatment${type}`);
        if (treatmentDiv) treatmentDiv.style.display = 'none';
        const preeclampsiaDiv = document.getElementById(`preeclampsiaTreatment${type}`);
        if (preeclampsiaDiv) preeclampsiaDiv.style.display = 'none';
        const infeccionesDiv = document.getElementById(`infeccionesTreatment${type}`);
        if (infeccionesDiv) infeccionesDiv.style.display = 'none';
        const obesidadDiv = document.getElementById(`obesidadDetails${type}`);
        if (obesidadDiv) obesidadDiv.style.display = 'none';
        const obesidadTreatmentDiv = document.getElementById(`obesidadTreatment${type}`);
        if (obesidadTreatmentDiv) obesidadTreatmentDiv.style.display = 'none';
        const sindromeDiv = document.getElementById(`sindromeDetails${type}`);
        if (sindromeDiv) sindromeDiv.style.display = 'none';
        const sindromeTreatmentDiv = document.getElementById(`sindromeTreatment${type}`);
        if (sindromeTreatmentDiv) sindromeTreatmentDiv.style.display = 'none';
        const hipertensionDiv = document.getElementById(`hipertensionTreatment${type}`);
        if (hipertensionDiv) hipertensionDiv.style.display = 'none';
        const hipercolesterolemiaDiv = document.getElementById(`hipercolesterolemiaTreatment${type}`);
        if (hipercolesterolemiaDiv) hipercolesterolemiaDiv.style.display = 'none';
        const hipertrigliceridemiaDiv = document.getElementById(`hipertrigliceridemiaTreatment${type}`);
        if (hipertrigliceridemiaDiv) hipertrigliceridemiaDiv.style.display = 'none';
        updateObesidadImcVisual(type, null);
    });
    const nh = document.getElementById('hcNumeroHermanos');
    if (nh) nh.value = '1';
    [2, 3].forEach((i) => {
        const dst = document.getElementById('hcHermanosColWrap' + i);
        if (dst) {
            dst.innerHTML = '';
            delete dst.dataset.cloned;
        }
    });
    if (typeof syncHermanosColumnsCount === 'function') syncHermanosColumnsCount();
    
    // Limpiar Exploración Física
    const physicalFields = [
        'hcPeso', 'hcTalla', 'hcPerimetroCefalico', 'hcPerimetroBraquial',
        'hcFrecuenciaCardiaca', 'hcFrecuenciaRespiratoria', 'hcTemperatura', 'hcOximetriaPulso'
    ];
    physicalFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    
    // Limpiar Diagnóstico Nutricional
    document.querySelectorAll('input[name="hcTomaMuestra"]').forEach(radio => radio.checked = false);
    const nutritionalFields = [
        'hcFechaTomaMuestra', 'hcGlucosaTamiz', 'hcColesterolTamiz',
        'hcTrigliceridosTamiz', 'hcHDLTamiz'
    ];
    nutritionalFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    const tomaMuestraDiv = document.getElementById('tomaMuestraDetails');
    if (tomaMuestraDiv) tomaMuestraDiv.style.display = 'none';
    
    // Limpiar Diagnóstico General
    const generalFields = ['hcDiagnosticosPrevios', 'hcDiagnosticosActuales'];
    generalFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    
    // Limpiar Datos del Doctor
    const doctorFields = ['hcMedicoRealizo', 'hcMedicoReviso'];
    doctorFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
}

// Mostrar pestaña específica
function showHCTab(tabName) {
    // Ocultar todas las pestañas
    const tabContents = document.querySelectorAll('.hc-tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Desactivar todos los botones de pestaña
    const tabButtons = document.querySelectorAll('.hc-tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Mostrar la pestaña seleccionada
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Activar el botón correspondiente
    const selectedButton = document.querySelector(`[onclick="showHCTab('${tabName}')"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
    
    currentHCTab = tabName;
};

// Filtrar pacientes por ID
function filterHCPatients() {
    const searchTerm = document.getElementById('hcPatientSearch').value.toLowerCase();
    const filteredPatients = allHCPatients.filter(patient => 
        patient.id.toLowerCase().includes(searchTerm)
    );
    displayHCPatients(filteredPatients);
};

// Cambiar base de datos
function changeHCDatabase() {
    selectedHCDatabase = null;
    selectedHCPatient = null;
    allHCPatients = [];
    
    document.getElementById('hcPatientSelector').style.display = 'none';
    document.getElementById('hcForm').style.display = 'none';
    document.getElementById('hcDatabaseSelector').style.display = 'block';
    
    // Limpiar búsqueda
    document.getElementById('hcPatientSearch').value = '';
    
    // Recalcular el tamaño del expander
    setTimeout(() => {
        recalculateHCExpanderHeight();
    }, 100);
};

// Seleccionar otro paciente
function selectAnotherHCPatient() {
    selectedHCPatient = null;
    
    document.getElementById('hcForm').style.display = 'none';
    document.getElementById('hcPatientSelector').style.display = 'block';
    
    // Limpiar búsqueda
    document.getElementById('hcPatientSearch').value = '';
    
    // Regenerar la lista completa de pacientes
    displayHCPatients(allHCPatients);
    
    // Recalcular el tamaño del expander después de volver al selector
    setTimeout(() => {
        recalculateHCExpanderHeight();
    }, 100);
};

// Guardar datos del paciente
async function saveHCPatientData() {
    if (!selectedHCDatabase || !selectedHCPatient) {
        showToast('Error: No se ha seleccionado paciente o base de datos', 'error');
        return;
    }
    
    // Validar campos requeridos
    const nombrePaciente = document.getElementById('hcNombrePaciente').value;
    const nss = document.getElementById('hcNSS').value;
    
    if (!nombrePaciente || !nss) {
        showToast('Nombre del paciente y NSS son campos requeridos', 'error');
        return;
    }
    
    try {
        // Preparar datos para enviar
        const hcData = {
            nombre_paciente: nombrePaciente,
            nss: nss,
            id_paciente: document.getElementById('hcIdPaciente').value,
            fecha_nacimiento: document.getElementById('hcFechaNacimiento').value,
            domicilio_principal: document.getElementById('hcDomicilioPrincipal').value,
            domicilio_alterno: document.getElementById('hcDomicilioAlterno').value,
            nombre_familiar: document.getElementById('hcNombreFamiliar').value,
            telefono: document.getElementById('hcTelefono').value,
            celular: document.getElementById('hcCelular').value,
            correo: document.getElementById('hcCorreo').value,
            realizo_hc: document.getElementById('hcRealizoHC').value,
            firma_mpss: document.getElementById('hcFirmaMPSS').value
        };
        
        const requestData = {
            database_id: selectedHCDatabase.id,
            patient_id: selectedHCPatient.id,
            hc_data: hcData
        };
        
        
        const response = await fetch('/api/hc/save-patient-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCConfirmationModal(result);
            resetHCForm();
        } else {
            showToast(result.message || 'Error guardando datos del paciente', 'error');
        }
        
    } catch (error) {
        console.error('Error guardando datos del paciente:', error);
        showToast('Error guardando datos del paciente', 'error');
    }
};

// Mostrar modal de confirmación para HC - Función genérica para todas las secciones
function showHCSectionConfirmationModal(result, sectionTitle, sectionMessage) {
    // Actualizar el estado del paciente en la lista para mostrar el icono de editar
    const patientIndex = allHCPatients.findIndex(p => p.id === result.patient_id);
    if (patientIndex !== -1) {
        allHCPatients[patientIndex].has_hc = true;
    }
    
    // Usar la función global showConfirmationModal
    if (typeof window.showConfirmationModal === 'function') {
        window.showConfirmationModal(
            result.patient_id, 
            result.database_id, 
            sectionTitle, 
            sectionMessage
        );
    } else {
        // Fallback a toast si no está disponible
        showToast(sectionMessage, 'success');
    }
    
    // Refrescar lista de pacientes para mostrar nuevos iconos
    displayHCPatients(allHCPatients);
}

// Mostrar modal de confirmación para HC - Datos del Paciente (mantener compatibilidad)
function showHCConfirmationModal(result) {
    showHCSectionConfirmationModal(
        result,
        "Datos del Paciente Guardados",
        "Datos del paciente guardados correctamente"
    );
}

// Mostrar modal de paciente ya procesado
function showHCPatientAlreadyProcessedModal(patientId) {
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
                    <p class="success-message">Este paciente ya tiene historia clínica registrada</p>
                    <div class="details">
                        <div class="detail-item">
                            <i class="fas fa-user" style="color: #dc3545;"></i>
                            <span><strong>Paciente:</strong> ${patientId}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-database" style="color: #dc3545;"></i>
                            <span><strong>Base de datos:</strong> ${selectedHCDatabase.id}</span>
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

// Descargar plantilla (placeholder)
function downloadHCTemplate() {
    if (!selectedHCDatabase) {
        showToast('Primero selecciona una base de datos', 'error');
        return;
    }
    
    showToast('Funcionalidad de descarga de plantilla en desarrollo', 'info');
};

// Recalcular altura del expander HC
function recalculateHCExpanderHeight() {
    const expanderContent = document.getElementById('hcExpanderContent');
    if (expanderContent && expanderContent.classList.contains('expanded')) {
        const contentHeight = expanderContent.scrollHeight;
        expanderContent.style.maxHeight = `${contentHeight + 50}px`;
    }
}

// Función de utilidad para formatear fechas
function formatDate(dateString) {
    if (!dateString) return 'Fecha no disponible';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'Fecha inválida';
    }
}

// Función de utilidad para mostrar toasts
function showToast(message, type = 'info') {
    // Esta función debería estar definida en el archivo principal
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
    }
}

// Función para mostrar/ocultar campo de causa de cesárea
function toggleCesareaCausa() {
    const cesareaRadio = document.querySelector('input[name="hcTipoParto"][value="Cesarea"]');
    const causaField = document.getElementById('hcCesareaCausa');
    const causaFieldContainer = causaField.parentElement;
    
    if (cesareaRadio && cesareaRadio.checked) {
        causaFieldContainer.style.display = 'block';
        causaField.required = true;
    } else {
        causaFieldContainer.style.display = 'none';
        causaField.required = false;
        causaField.value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar campo de horas de ruptura de membrana
function toggleRupturaHoras() {
    const rupturaSiRadio = document.querySelector('input[name="hcRupturaMembrana"][value="Si"]');
    const horasField = document.getElementById('hcRupturaHoras');
    const horasFieldContainer = horasField.parentElement;
    
    if (rupturaSiRadio && rupturaSiRadio.checked) {
        horasFieldContainer.style.display = 'block';
        horasField.required = true;
    } else {
        horasFieldContainer.style.display = 'none';
        horasField.required = false;
        horasField.value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar campo de especificación de anestesia
function toggleAnestesiaEspecifique() {
    const anestesiaSiRadio = document.querySelector('input[name="hcAnestesia"][value="Si"]');
    const especifiqueField = document.getElementById('hcAnestesiaEspecifique');
    const especifiqueFieldContainer = especifiqueField.parentElement;
    
    if (anestesiaSiRadio && anestesiaSiRadio.checked) {
        especifiqueFieldContainer.style.display = 'block';
        especifiqueField.required = true;
    } else {
        especifiqueFieldContainer.style.display = 'none';
        especifiqueField.required = false;
        especifiqueField.value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar campo "Otro" del sitio de parto
function toggleSitioPartoOtro() {
    const otroRadio = document.querySelector('input[name="hcSitioParto"][value="Otro"]');
    const otroField = document.getElementById('hcSitioPartoOtro');
    const otroFieldContainer = otroField.parentElement;
    
    if (otroRadio && otroRadio.checked) {
        otroFieldContainer.style.display = 'block';
        otroField.required = true;
    } else {
        otroFieldContainer.style.display = 'none';
        otroField.required = false;
        otroField.value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar campo de detalles de animales
function toggleAnimalesDetalle() {
    const animalesSiRadio = document.querySelector('input[name="hcConvivenciaAnimales"][value="Si"]');
    const animalesDetalleField = document.getElementById('hcAnimalesDetalle');
    const animalesDetalleContainer = animalesDetalleField.parentElement;
    
    if (animalesSiRadio && animalesSiRadio.checked) {
        animalesDetalleContainer.style.display = 'block';
        animalesDetalleField.required = true;
    } else {
        animalesDetalleContainer.style.display = 'none';
        animalesDetalleField.required = false;
        animalesDetalleField.value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar detalles de diabetes
function toggleDiabetesDetails(familyType) {
    const diabetesSiRadio = document.querySelector(`input[name="hcDiabetes${familyType}"][value="Si"]`);
    const diabetesDetailsDiv = document.getElementById(`diabetesDetails${familyType}`);
    
    if (diabetesSiRadio && diabetesSiRadio.checked) {
        diabetesDetailsDiv.style.display = 'block';
    } else {
        diabetesDetailsDiv.style.display = 'none';
        // Limpiar todos los campos cuando se oculta
        clearDiabetesFields(familyType);
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar tratamiento de diabetes
function toggleDiabetesTreatment(familyType) {
    const diabetesCheckboxes = document.querySelectorAll(`input[name="hcDiabetesTipo${familyType}"]:checked`);
    const treatmentDiv = document.getElementById(`diabetesTreatment${familyType}`);
    
    if (diabetesCheckboxes.length > 0) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        document.getElementById(`hcTratamientoDiabetes${familyType}`).value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar tratamiento de preeclampsia
function togglePreeclampsiaTreatment(familyType) {
    const preeclampsiaSiRadio = document.querySelector(`input[name="hcPreeclampsia${familyType}"][value="Si"]`);
    const treatmentDiv = document.getElementById(`preeclampsiaTreatment${familyType}`);
    
    if (preeclampsiaSiRadio && preeclampsiaSiRadio.checked) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        document.getElementById(`hcTratamientoPreeclampsia${familyType}`).value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar tratamiento de infecciones
function toggleInfeccionesTreatment(familyType) {
    const infeccionesSiRadio = document.querySelector(`input[name="hcInfeccionesEmbarazo${familyType}"][value="Si"]`);
    const treatmentDiv = document.getElementById(`infeccionesTreatment${familyType}`);
    
    if (infeccionesSiRadio && infeccionesSiRadio.checked) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        document.getElementById(`hcTratamientoInfecciones${familyType}`).value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar detalles de obesidad
function toggleObesidadDetails(familyType) {
    const obesidadSiRadio = document.querySelector(`input[name="hcObesidad${familyType}"][value="Si"]`);
    const obesidadDetailsDiv = document.getElementById(`obesidadDetails${familyType}`);
    
    if (!obesidadDetailsDiv) return;
    
    if (obesidadSiRadio && obesidadSiRadio.checked) {
        obesidadDetailsDiv.style.display = 'block';
        calculateObesidadIMC(familyType);
    } else {
        obesidadDetailsDiv.style.display = 'none';
        clearObesidadFields(familyType);
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

function toggleObesidadTreatment(familyType) {
    const tratamientoSiRadio = document.querySelector(`input[name="hcRecibeTratamientoObesidad${familyType}"][value="Si"]`);
    const treatmentDiv = document.getElementById(`obesidadTreatment${familyType}`);
    
    if (!treatmentDiv) return;
    
    if (tratamientoSiRadio && tratamientoSiRadio.checked) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        const treatmentInput = document.getElementById(`hcTratamientoObesidad${familyType}`);
        if (treatmentInput) treatmentInput.value = '';
    }
    
    recalculateHCExpanderHeight();
}

function bmiNutritionCategoryLabel(bmi) {
    if (!Number.isFinite(bmi) || bmi <= 0) return '—';
    if (bmi < 18.5) return 'Bajo peso';
    if (bmi < 25) return 'Normal';
    if (bmi < 30) return 'Sobrepeso';
    return 'Obesidad';
}

/** Posición del marcador (0–100 %) sobre la barra de 4 zonas iguales. */
function bmiToGaugePercent(bmi) {
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    if (!Number.isFinite(bmi) || bmi <= 0) return 50;
    if (bmi < 18.5) return clamp(((bmi - 13) / (18.5 - 13)) * 25, 3, 22);
    if (bmi < 25) return 25 + clamp(((bmi - 18.5) / (25 - 18.5)) * 25, 3, 22);
    if (bmi < 30) return 50 + clamp(((bmi - 25) / (30 - 25)) * 25, 3, 22);
    return 75 + clamp(((bmi - 30) / 15) * 25, 3, 97);
}

function updateObesidadImcVisual(familyType, imc) {
    const wrap = document.getElementById(`hcObesidadImcGaugeWrap${familyType}`);
    const display = document.getElementById(`hcObesidadImcDisplay${familyType}`);
    const categoria = document.getElementById(`hcObesidadImcCategoria${familyType}`);
    const marker = document.getElementById(`hcObesidadImcMarker${familyType}`);
    if (!wrap || !display || !categoria || !marker) return;

    if (!Number.isFinite(imc) || imc <= 0) {
        wrap.style.display = 'none';
        display.textContent = '—';
        categoria.textContent = '—';
        marker.style.left = '50%';
        return;
    }

    wrap.style.display = 'block';
    display.textContent = imc.toFixed(2);
    categoria.textContent = bmiNutritionCategoryLabel(imc);
    marker.style.left = bmiToGaugePercent(imc) + '%';
    recalculateHCExpanderHeight();
}

function calculateObesidadIMC(familyType) {
    const pesoEl = document.getElementById(`hcPesoObesidad${familyType}`);
    const estaturaEl = document.getElementById(`hcEstaturaObesidad${familyType}`);
    const imcEl = document.getElementById(`hcIMCObesidad${familyType}`);
    
    if (!pesoEl || !estaturaEl || !imcEl) return;
    
    const peso = parseFloat(pesoEl.value);
    const estaturaCm = parseFloat(estaturaEl.value);
    
    if (!peso || !estaturaCm || estaturaCm <= 0) {
        imcEl.value = '';
        updateObesidadImcVisual(familyType, null);
        return;
    }
    
    const estaturaM = estaturaCm / 100;
    const imc = peso / (estaturaM * estaturaM);
    if (!Number.isFinite(imc)) {
        imcEl.value = '';
        updateObesidadImcVisual(familyType, null);
        return;
    }
    imcEl.value = imc.toFixed(2);
    updateObesidadImcVisual(familyType, imc);
}

function clearObesidadFields(familyType) {
    const pesoEl = document.getElementById(`hcPesoObesidad${familyType}`);
    const estaturaEl = document.getElementById(`hcEstaturaObesidad${familyType}`);
    const imcEl = document.getElementById(`hcIMCObesidad${familyType}`);
    const tratamientoEl = document.getElementById(`hcTratamientoObesidad${familyType}`);
    const treatmentDiv = document.getElementById(`obesidadTreatment${familyType}`);
    
    if (pesoEl) pesoEl.value = '';
    if (estaturaEl) estaturaEl.value = '';
    if (imcEl) imcEl.value = '';
    if (tratamientoEl) tratamientoEl.value = '';
    if (treatmentDiv) treatmentDiv.style.display = 'none';
    
    document.querySelectorAll(`input[name="hcActividadFisicaObesidad${familyType}"]`).forEach(radio => radio.checked = false);
    document.querySelectorAll(`input[name="hcRecibeTratamientoObesidad${familyType}"]`).forEach(radio => radio.checked = false);
    updateObesidadImcVisual(familyType, null);
}

// Función para mostrar/ocultar detalles del síndrome metabólico
function toggleSindromeMetabolicoDetails(familyType) {
    const sindromeSiRadio = document.querySelector(`input[name="hcSindromeMetabolico${familyType}"][value="Si"]`);
    const detailsDiv = document.getElementById(`sindromeMetabolicoDetails${familyType}`);
    
    if (sindromeSiRadio && sindromeSiRadio.checked) {
        detailsDiv.style.display = 'block';
    } else {
        detailsDiv.style.display = 'none';
        // Limpiar checkboxes y campos de tratamiento
        const checkboxes = document.querySelectorAll(`input[name="hcSindromePatologias${familyType}"]`);
        checkboxes.forEach(checkbox => checkbox.checked = false);
        document.getElementById(`hcTratamientoSindrome${familyType}`).value = '';
        document.getElementById(`sindromeTreatment${familyType}`).style.display = 'none';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar tratamiento del síndrome metabólico
function toggleSindromeTreatment(familyType) {
    const sindromeCheckboxes = document.querySelectorAll(`input[name="hcSindromePatologias${familyType}"]:checked`);
    const treatmentDiv = document.getElementById(`sindromeTreatment${familyType}`);
    
    if (sindromeCheckboxes.length >= 3) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        document.getElementById(`hcTratamientoSindrome${familyType}`).value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar tratamiento de hipertensión
function toggleHipertensionTreatment(familyType) {
    const hipertensionSiRadio = document.querySelector(`input[name="hcHipertension${familyType}"][value="Si"]`);
    const treatmentDiv = document.getElementById(`hipertensionTreatment${familyType}`);
    
    if (hipertensionSiRadio && hipertensionSiRadio.checked) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        // Limpiar radio buttons de tratamiento
        const treatmentRadios = document.querySelectorAll(`input[name="hcTratamientoHipertension${familyType}"]`);
        treatmentRadios.forEach(radio => radio.checked = false);
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar tratamiento de hipercolesterolemia
function toggleHipercolesterolemiaTreatment(familyType) {
    const hipercolesterolemiaSiRadio = document.querySelector(`input[name="hcHipercolesterolemia${familyType}"][value="Si"]`);
    const treatmentDiv = document.getElementById(`hipercolesterolemiaTreatment${familyType}`);
    
    if (hipercolesterolemiaSiRadio && hipercolesterolemiaSiRadio.checked) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        // Limpiar radio buttons de tratamiento
        const treatmentRadios = document.querySelectorAll(`input[name="hcTratamientoHipercolesterolemia${familyType}"]`);
        treatmentRadios.forEach(radio => radio.checked = false);
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para mostrar/ocultar tratamiento de hipertrigliceridemia
function toggleHipertrigliceridemiaTreatment(familyType) {
    const hipertrigliceridemiaSiRadio = document.querySelector(`input[name="hcHipertrigliceridemia${familyType}"][value="Si"]`);
    const treatmentDiv = document.getElementById(`hipertrigliceridemiaTreatment${familyType}`);
    
    if (hipertrigliceridemiaSiRadio && hipertrigliceridemiaSiRadio.checked) {
        treatmentDiv.style.display = 'block';
    } else {
        treatmentDiv.style.display = 'none';
        // Limpiar radio buttons de tratamiento
        const treatmentRadios = document.querySelectorAll(`input[name="hcTratamientoHipertrigliceridemia${familyType}"]`);
        treatmentRadios.forEach(radio => radio.checked = false);
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para limpiar campos de diabetes
function clearDiabetesFields(familyType) {
    // Limpiar checkboxes de tipo de diabetes
    const diabetesCheckboxes = document.querySelectorAll(`input[name="hcDiabetesTipo${familyType}"]`);
    diabetesCheckboxes.forEach(checkbox => checkbox.checked = false);
    
    // Ocultar y limpiar campos de tratamiento
    document.getElementById(`diabetesTreatment${familyType}`).style.display = 'none';
    document.getElementById(`hcTratamientoDiabetes${familyType}`).value = '';
    
    // Limpiar otros campos específicos según el tipo de familia
    if (familyType === 'Materna') {
        // Limpiar campos específicos de materna
        const preeclampsiaRadio = document.querySelector(`input[name="hcPreeclampsia${familyType}"]:checked`);
        if (preeclampsiaRadio) preeclampsiaRadio.checked = false;
        
        const infeccionesRadio = document.querySelector(`input[name="hcInfeccionesEmbarazo${familyType}"]:checked`);
        if (infeccionesRadio) infeccionesRadio.checked = false;
        
        document.getElementById(`hcPesoEmbarazo${familyType}`).value = '';
        document.getElementById(`preeclampsiaTreatment${familyType}`).style.display = 'none';
        document.getElementById(`infeccionesTreatment${familyType}`).style.display = 'none';
        document.getElementById(`hcTratamientoPreeclampsia${familyType}`).value = '';
        document.getElementById(`hcTratamientoInfecciones${familyType}`).value = '';
    }
    
    // Limpiar síndrome metabólico
    const sindromeRadio = document.querySelector(`input[name="hcSindromeMetabolico${familyType}"]:checked`);
    if (sindromeRadio) sindromeRadio.checked = false;
    document.getElementById(`sindromeMetabolicoDetails${familyType}`).style.display = 'none';
    document.getElementById(`sindromeTreatment${familyType}`).style.display = 'none';
    document.getElementById(`hcTratamientoSindrome${familyType}`).value = '';
    
    // Limpiar checkboxes del síndrome metabólico
    const sindromeCheckboxes = document.querySelectorAll(`input[name="hcSindromePatologias${familyType}"]`);
    sindromeCheckboxes.forEach(checkbox => checkbox.checked = false);
}

// Función para mostrar/ocultar detalles de toma de muestra
function toggleTomaMuestraDetails() {
    const tomaMuestraSiRadio = document.querySelector('input[name="hcTomaMuestra"][value="Si"]');
    const detallesDiv = document.getElementById('tomaMuestraDetails');
    
    if (tomaMuestraSiRadio && tomaMuestraSiRadio.checked) {
        detallesDiv.style.display = 'block';
    } else {
        detallesDiv.style.display = 'none';
        // Limpiar campos cuando se oculta
        document.getElementById('hcFechaTomaMuestra').value = '';
        document.getElementById('hcGlucosaTamiz').value = '';
        document.getElementById('hcColesterolTamiz').value = '';
        document.getElementById('hcTrigliceridosTamiz').value = '';
        document.getElementById('hcHDLTamiz').value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para guardar diagnóstico general
async function saveHCGeneralDiagnosis() {
    try {
        
        if (!selectedHCPatient || !selectedHCDatabase) {
            showToast('Debe seleccionar un paciente y una base de datos', 'error');
            return;
        }
        
        const generalDiagnosisData = {
            diagnosticosPrevios: document.getElementById('hcDiagnosticosPrevios').value,
            diagnosticosActuales: document.getElementById('hcDiagnosticosActuales').value
        };
        
        
        const response = await fetch('/api/hc/save-general-diagnosis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                general_diagnosis_data: generalDiagnosisData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Diagnóstico General Guardado",
                "Diagnóstico general guardado correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar diagnóstico general');
        }
        
    } catch (error) {
        console.error('Error guardando diagnóstico general:', error);
        showToast('Error al guardar diagnóstico general: ' + error.message, 'error');
    }
}

// Función para descargar plantilla completa de Historia Clínica
async function downloadHCCompleteTemplate() {
    try {
        
        // Mostrar mensaje de carga
        showToast('Generando plantilla PDF de Historia Clínica...', 'info');
        
        // Llamar al endpoint para generar el PDF
        const response = await fetch('/api/hc/download-hc-template', {
            method: 'GET',
        });
        
        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
        }
        
        // Obtener el contenido del PDF
        const blob = await response.blob();
        
        // Crear URL temporal para descarga
        const url = window.URL.createObjectURL(blob);
        
        // Crear elemento de descarga
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_historia_clinica_completa.pdf';
        document.body.appendChild(a);
        a.click();
        
        // Limpiar
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('Plantilla PDF descargada correctamente', 'success');
        
    } catch (error) {
        console.error('Error descargando plantilla de Historia Clínica:', error);
        showToast('Error al descargar plantilla: ' + error.message, 'error');
    }
}

// Función para guardar datos del doctor
async function saveHCDoctorData() {
    try {
        
        if (!selectedHCPatient || !selectedHCDatabase) {
            showToast('Debe seleccionar un paciente y una base de datos', 'error');
            return;
        }
        
        const doctorData = {
            medicoRealizo: document.getElementById('hcMedicoRealizo').value,
            medicoReviso: document.getElementById('hcMedicoReviso').value,
            firmaMedico: 'Firma registrada' // Placeholder para la firma
        };
        
        
        const response = await fetch('/api/hc/save-doctor-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                doctor_data: doctorData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Datos del Doctor Guardados",
                "Datos del doctor guardados correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar datos del doctor');
        }
        
    } catch (error) {
        console.error('Error guardando datos del doctor:', error);
        showToast('Error al guardar datos del doctor: ' + error.message, 'error');
    }
}

// Función para guardar diagnóstico nutricional
async function saveHCNutritionalDiagnosis() {
    try {
        
        if (!selectedHCPatient || !selectedHCDatabase) {
            showToast('Debe seleccionar un paciente y una base de datos', 'error');
            return;
        }
        
        const nutritionalDiagnosisData = {
            tomaMuestra: document.querySelector('input[name="hcTomaMuestra"]:checked')?.value,
            fechaTomaMuestra: document.getElementById('hcFechaTomaMuestra').value,
            glucosaTamiz: document.getElementById('hcGlucosaTamiz').value,
            colesterolTamiz: document.getElementById('hcColesterolTamiz').value,
            trigliceridosTamiz: document.getElementById('hcTrigliceridosTamiz').value,
            hdlTamiz: document.getElementById('hcHDLTamiz').value
        };
        
        
        const response = await fetch('/api/hc/save-nutritional-diagnosis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                nutritional_diagnosis_data: nutritionalDiagnosisData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Diagnóstico Nutricional Guardado",
                "Diagnóstico nutricional guardado correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar diagnóstico nutricional');
        }
        
    } catch (error) {
        console.error('Error guardando diagnóstico nutricional:', error);
        showToast('Error al guardar diagnóstico nutricional: ' + error.message, 'error');
    }
}

// Función para guardar exploración física
async function saveHCPhysicalExam() {
    try {
        
        if (!selectedHCPatient || !selectedHCDatabase) {
            showToast('Debe seleccionar un paciente y una base de datos', 'error');
            return;
        }
        
        const physicalExamData = {
            peso: document.getElementById('hcPeso').value,
            talla: document.getElementById('hcTalla').value,
            perimetroCefalico: document.getElementById('hcPerimetroCefalico').value,
            perimetroBraquial: document.getElementById('hcPerimetroBraquial').value,
            frecuenciaCardiaca: document.getElementById('hcFrecuenciaCardiaca').value,
            frecuenciaRespiratoria: document.getElementById('hcFrecuenciaRespiratoria').value,
            temperatura: document.getElementById('hcTemperatura').value,
            oximetriaPulso: document.getElementById('hcOximetriaPulso').value
        };
        
        
        const response = await fetch('/api/hc/save-physical-exam', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                physical_exam_data: physicalExamData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Exploración Física Guardada",
                "Exploración física guardada correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar exploración física');
        }
        
    } catch (error) {
        console.error('Error guardando exploración física:', error);
        showToast('Error al guardar exploración física: ' + error.message, 'error');
    }
}

// Función para guardar antecedentes heredofamiliares
async function saveHCFamilyHistory() {
    try {
        
        if (!selectedHCPatient || !selectedHCDatabase) {
            showToast('Debe seleccionar un paciente y una base de datos', 'error');
            return;
        }
        
        // Recopilar datos del formulario
        const familyHistoryData = {
            // MATERNOS
            edadMaterna: document.getElementById('hcEdadMaterna').value,
            diabetesMaterna: document.querySelector('input[name="hcDiabetesMaterna"]:checked')?.value,
            diabetesTipoMaterna: Array.from(document.querySelectorAll('input[name="hcDiabetesTipoMaterna"]:checked')).map(cb => cb.value),
            tratamientoDiabetesMaterna: document.getElementById('hcTratamientoDiabetesMaterna').value,
            preeclampsiaMaterna: document.querySelector('input[name="hcPreeclampsiaMaterna"]:checked')?.value,
            tratamientoPreeclampsiaMaterna: document.getElementById('hcTratamientoPreeclampsiaMaterna').value,
            infeccionesEmbarazoMaterna: document.querySelector('input[name="hcInfeccionesEmbarazoMaterna"]:checked')?.value,
            tratamientoInfeccionesMaterna: document.getElementById('hcTratamientoInfeccionesMaterna').value,
            obesidadMaterna: document.querySelector('input[name="hcObesidadMaterna"]:checked')?.value,
            pesoObesidadMaterna: document.getElementById('hcPesoObesidadMaterna').value,
            estaturaObesidadMaterna: document.getElementById('hcEstaturaObesidadMaterna').value,
            imcObesidadMaterna: document.getElementById('hcIMCObesidadMaterna').value,
            actividadFisicaObesidadMaterna: document.querySelector('input[name="hcActividadFisicaObesidadMaterna"]:checked')?.value,
            recibeTratamientoObesidadMaterna: document.querySelector('input[name="hcRecibeTratamientoObesidadMaterna"]:checked')?.value,
            tratamientoObesidadMaterna: document.getElementById('hcTratamientoObesidadMaterna').value,
            sindromeMetabolicoMaterna: document.querySelector('input[name="hcSindromeMetabolicoMaterna"]:checked')?.value,
            sindromePatologiasMaterna: Array.from(document.querySelectorAll('input[name="hcSindromePatologiasMaterna"]:checked')).map(cb => cb.value),
            tratamientoSindromeMaterna: document.getElementById('hcTratamientoSindromeMaterna').value,
            hipertensionMaterna: document.querySelector('input[name="hcHipertensionMaterna"]:checked')?.value,
            tratamientoHipertensionMaterna: document.querySelector('input[name="hcTratamientoHipertensionMaterna"]:checked')?.value,
            hipercolesterolemiaMaterna: document.querySelector('input[name="hcHipercolesterolemiaMaterna"]:checked')?.value,
            tratamientoHipercolesterolemiaMaterna: document.querySelector('input[name="hcTratamientoHipercolesterolemiaMaterna"]:checked')?.value,
            hipertrigliceridemiaMaterna: document.querySelector('input[name="hcHipertrigliceridemiaMaterna"]:checked')?.value,
            tratamientoHipertrigliceridemiaMaterna: document.querySelector('input[name="hcTratamientoHipertrigliceridemiaMaterna"]:checked')?.value,
            otrasPatologiasMaterna: document.getElementById('hcOtrasPatologiasMaterna').value,
            
            // PATERNOS
            edadPaterna: document.getElementById('hcEdadPaterna').value,
            diabetesPaterna: document.querySelector('input[name="hcDiabetesPaterna"]:checked')?.value,
            diabetesTipoPaterna: Array.from(document.querySelectorAll('input[name="hcDiabetesTipoPaterna"]:checked')).map(cb => cb.value),
            tratamientoDiabetesPaterna: document.getElementById('hcTratamientoDiabetesPaterna').value,
            obesidadPaterna: document.querySelector('input[name="hcObesidadPaterna"]:checked')?.value,
            pesoObesidadPaterna: document.getElementById('hcPesoObesidadPaterna').value,
            estaturaObesidadPaterna: document.getElementById('hcEstaturaObesidadPaterna').value,
            imcObesidadPaterna: document.getElementById('hcIMCObesidadPaterna').value,
            actividadFisicaObesidadPaterna: document.querySelector('input[name="hcActividadFisicaObesidadPaterna"]:checked')?.value,
            recibeTratamientoObesidadPaterna: document.querySelector('input[name="hcRecibeTratamientoObesidadPaterna"]:checked')?.value,
            tratamientoObesidadPaterna: document.getElementById('hcTratamientoObesidadPaterna').value,
            sindromeMetabolicoPaterna: document.querySelector('input[name="hcSindromeMetabolicoPaterna"]:checked')?.value,
            sindromePatologiasPaterna: Array.from(document.querySelectorAll('input[name="hcSindromePatologiasPaterna"]:checked')).map(cb => cb.value),
            tratamientoSindromePaterna: document.getElementById('hcTratamientoSindromePaterna').value,
            hipertensionPaterna: document.querySelector('input[name="hcHipertensionPaterna"]:checked')?.value,
            tratamientoHipertensionPaterna: document.querySelector('input[name="hcTratamientoHipertensionPaterna"]:checked')?.value,
            hipercolesterolemiaPaterna: document.querySelector('input[name="hcHipercolesterolemiaPaterna"]:checked')?.value,
            tratamientoHipercolesterolemiaPaterna: document.querySelector('input[name="hcTratamientoHipercolesterolemiaPaterna"]:checked')?.value,
            hipertrigliceridemiaPaterna: document.querySelector('input[name="hcHipertrigliceridemiaPaterna"]:checked')?.value,
            tratamientoHipertrigliceridemiaPaterna: document.querySelector('input[name="hcTratamientoHipertrigliceridemiaPaterna"]:checked')?.value,
            otrasPatologiasPaterna: document.getElementById('hcOtrasPatologiasPaterna').value,

            // HERMANOS (hasta 3 columnas; `hermanos`[] + claves planas del primer hermano por compatibilidad)
            ...collectHermanosSlotsForSave()
        };
        
        
        const response = await fetch('/api/hc/save-family-history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                family_history_data: familyHistoryData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Antecedentes Heredofamiliares Guardados",
                "Antecedentes heredofamiliares guardados correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar antecedentes heredofamiliares');
        }
        
    } catch (error) {
        console.error('Error guardando antecedentes heredofamiliares:', error);
        showToast('Error al guardar antecedentes heredofamiliares: ' + error.message, 'error');
    }
}

// Función para mostrar/ocultar campo de detalles de substancias tóxicas
function toggleToxicasDetalle() {
    const toxicasSiRadio = document.querySelector('input[name="hcExposicionToxicas"][value="Si"]');
    const toxicasDetalleField = document.getElementById('hcToxicasDetalle');
    const toxicasDetalleContainer = toxicasDetalleField.parentElement;
    
    if (toxicasSiRadio && toxicasSiRadio.checked) {
        toxicasDetalleContainer.style.display = 'block';
        toxicasDetalleField.required = true;
    } else {
        toxicasDetalleContainer.style.display = 'none';
        toxicasDetalleField.required = false;
        toxicasDetalleField.value = '';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para guardar desarrollo psicomotor
async function saveHCPsychomotorDevelopment() {
    try {
        
        // Recopilar datos del formulario
        const psychomotorData = {
            // Hitos del Desarrollo Psicomotor
            siguioObjetos: document.getElementById('hcSiguioObjetos').value,
            sonrio: document.getElementById('hcSonrio').value,
            sostuvoCabeza: document.getElementById('hcSostuvoCabeza').value,
            seSento: document.getElementById('hcSeSento').value,
            camino: document.getElementById('hcCamino').value,
            
            // Control de Esfínteres
            controlVesical: document.getElementById('hcControlVesical').value,
            controlAnal: document.getElementById('hcControlAnal').value,
            
            // Escolaridad
            escolaridadActual: document.getElementById('hcEscolaridadActual').value,
            anosReprobados: document.getElementById('hcAnosReprobados').value,
            
            // Datos Anormales
            datosAnormales: document.getElementById('hcDatosAnormales').value,
            
            // Factores Ambientales
            convivenciaAnimales: document.querySelector('input[name="hcConvivenciaAnimales"]:checked')?.value,
            animalesDetalle: document.getElementById('hcAnimalesDetalle').value,
            exposicionToxicas: document.querySelector('input[name="hcExposicionToxicas"]:checked')?.value,
            toxicasDetalle: document.getElementById('hcToxicasDetalle').value
        };
        
        
        // Enviar datos al servidor
        const response = await fetch('/api/hc/save-psychomotor-development', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                psychomotor_data: psychomotorData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Desarrollo Psicomotor Guardado",
                "Desarrollo psicomotor guardado correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar desarrollo psicomotor');
        }
        
    } catch (error) {
        console.error('Error guardando desarrollo psicomotor:', error);
        showToast('Error al guardar desarrollo psicomotor: ' + error.message, 'error');
    }
}

// Función para guardar esquema de vacunación
async function saveHCVaccinationScheme() {
    try {
        
        // Recopilar todas las vacunas marcadas
        const vaccinationData = {
            // BCG
            bcgUnica: document.querySelector('input[name="bcg-unica"]').checked,
            
            // Hepatitis B
            hepatitisBUnica: document.querySelector('input[name="hepatitis-b-unica"]').checked,
            
            // Hexavalente DPaT+VPI+Hib+HepB
            hexavalentePrimera: document.querySelector('input[name="hexavalente-primera"]').checked,
            hexavalenteSegunda: document.querySelector('input[name="hexavalente-segunda"]').checked,
            hexavalenteTercera: document.querySelector('input[name="hexavalente-tercera"]').checked,
            hexavalenteRefuerzo: document.querySelector('input[name="hexavalente-refuerzo"]').checked,
            
            // DPT
            dptRefuerzo: document.querySelector('input[name="dpt-refuerzo"]').checked,
            
            // Rotavirus
            rotavirusPrimera: document.querySelector('input[name="rotavirus-primera"]').checked,
            rotavirusSegunda: document.querySelector('input[name="rotavirus-segunda"]').checked,
            
            // Neumocócica conjugada
            neumococicaPrimera: document.querySelector('input[name="neumococica-primera"]').checked,
            neumococicaSegunda: document.querySelector('input[name="neumococica-segunda"]').checked,
            
            // SRP (Triple viral)
            srpPrimera: document.querySelector('input[name="srp-primera"]').checked,
            srpSegunda: document.querySelector('input[name="srp-segunda"]').checked,
            srpTercera: document.querySelector('input[name="srp-tercera"]').checked,
            
            // Influenza
            influenzaPrimera: document.querySelector('input[name="influenza-primera"]').checked,
            influenzaSegunda: document.querySelector('input[name="influenza-segunda"]').checked,
            influenzaAnual1: document.querySelector('input[name="influenza-anual-1"]').checked,
            influenzaAnual2: document.querySelector('input[name="influenza-anual-2"]').checked,
            influenzaAnual3: document.querySelector('input[name="influenza-anual-3"]').checked,
            influenzaAnual4: document.querySelector('input[name="influenza-anual-4"]').checked,
            influenzaRiesgoPrimera: document.querySelector('input[name="influenza-riesgo-primera"]').checked,
            
            // COVID-19
            covidPrimario: document.querySelector('input[name="covid-primario"]').checked,
            covidSegunda: document.querySelector('input[name="covid-segunda"]').checked,
            covidTercera: document.querySelector('input[name="covid-tercera"]').checked,
            covidRefuerzo: document.querySelector('input[name="covid-refuerzo"]').checked
        };
        
        
        // Enviar datos al servidor
        const response = await fetch('/api/hc/save-vaccination-scheme', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                vaccination_data: vaccinationData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Esquema de Vacunación Guardado",
                "Esquema de vacunación guardado correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar esquema de vacunación');
        }
        
    } catch (error) {
        console.error('Error guardando esquema de vacunación:', error);
        showToast('Error al guardar esquema de vacunación: ' + error.message, 'error');
    }
}

// Función para mostrar/ocultar campos de actividad física
function toggleActividadFisicaDetalle() {
    const actividadSiRadio = document.querySelector('input[name="hcActividadFisica"][value="Si"]');
    const tipoActividadContainer = document.querySelector('input[name="hcTipoActividad"]').parentElement.parentElement.parentElement;
    const frecuenciaContainer = document.getElementById('hcFrecuenciaActividad').parentElement;
    
    if (actividadSiRadio && actividadSiRadio.checked) {
        tipoActividadContainer.style.display = 'block';
        frecuenciaContainer.style.display = 'block';
        // Hacer requeridos los campos
        document.querySelectorAll('input[name="hcTipoActividad"]').forEach(input => {
            input.required = true;
        });
        document.getElementById('hcFrecuenciaActividad').required = true;
    } else {
        tipoActividadContainer.style.display = 'none';
        frecuenciaContainer.style.display = 'none';
        // Limpiar valores y quitar requerido
        document.querySelectorAll('input[name="hcTipoActividad"]').forEach(input => {
            input.checked = false;
            input.required = false;
        });
        document.getElementById('hcFrecuenciaActividad').value = '';
        document.getElementById('hcFrecuenciaActividad').required = false;
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para guardar antecedentes personales
async function saveHCPersonalHistory() {
    try {
        
        // Recopilar datos del formulario
        const personalHistoryData = {
            // PERINATALES
            embarazoNumero: document.getElementById('hcEmbarazoNumero').value,
            cursoNormal: document.querySelector('input[name="hcCursoNormal"]:checked')?.value,
            semanasGestacion: document.getElementById('hcSemanasGestacion').value,
            termino: document.querySelector('input[name="hcTermino"]:checked')?.value,
            sitioParto: document.querySelector('input[name="hcSitioParto"]:checked')?.value,
            sitioPartoOtro: document.getElementById('hcSitioPartoOtro').value,
            tipoParto: document.querySelector('input[name="hcTipoParto"]:checked')?.value,
            cesareaCausa: document.getElementById('hcCesareaCausa').value,
            pesoNacer: document.getElementById('hcPesoNacer').value,
            tallaNacer: document.getElementById('hcTallaNacer').value,
            rupturaMembrana: document.querySelector('input[name="hcRupturaMembrana"]:checked')?.value,
            rupturaHoras: document.getElementById('hcRupturaHoras').value,
            anestesia: document.querySelector('input[name="hcAnestesia"]:checked')?.value,
            anestesiaEspecifique: document.getElementById('hcAnestesiaEspecifique').value,
            complicaciones: Array.from(document.querySelectorAll('input[name="hcComplicaciones"]:checked')).map(cb => cb.value),
            complicacionesDetalle: document.getElementById('hcComplicacionesDetalle').value,
            
            // TAMIZ Neonatal
            tamizNeonatal: document.querySelector('input[name="hcTamizNeonatal"]:checked')?.value,
            tamizResultado: document.querySelector('input[name="hcTamizResultado"]:checked')?.value,
            tamizPatologia: document.getElementById('hcTamizPatologia').value,
            tamizTratamiento: document.querySelector('input[name="hcTamizTratamiento"]:checked')?.value,
            tamizTratamientoDetalle: document.getElementById('hcTamizTratamientoDetalle').value,
            
            // NO PATOLÓGICOS - ALIMENTACIÓN
            lactanciaMaterna: document.querySelector('input[name="hcLactanciaMaterna"]:checked')?.value,
            lactanciaDuracion: document.getElementById('hcLactanciaDuracion').value,
            ablactacion: document.getElementById('hcAblactacion').value,
            
            // Consumo semanal de alimentos
            carnesRojas: document.getElementById('hcCarnesRojas').value,
            carnesBlancas: document.getElementById('hcCarnesBlancas').value,
            leche: document.getElementById('hcLeche').value,
            huevo: document.getElementById('hcHuevo').value,
            frutas: document.getElementById('hcFrutas').value,
            cereales: document.getElementById('hcCereales').value,
            verduras: document.getElementById('hcVerduras').value,
            leguminosas: document.getElementById('hcLeguminosas').value,
            refrescos: document.getElementById('hcRefrescos').value,
            agua: document.getElementById('hcAgua').value,
            frituras: document.getElementById('hcFrituras').value,
            dulces: document.getElementById('hcDulces').value,
            embutidos: document.getElementById('hcEmbutidos').value,
            derivadosMaiz: document.getElementById('hcDerivadosMaiz').value,
            
            // Actividad física
            actividadFisica: document.querySelector('input[name="hcActividadFisica"]:checked')?.value,
            tipoActividad: document.querySelector('input[name="hcTipoActividad"]:checked')?.value,
            frecuenciaActividad: document.getElementById('hcFrecuenciaActividad').value
        };
        
        
        // Validar campos obligatorios básicos
        if (!personalHistoryData.embarazoNumero || !personalHistoryData.cursoNormal) {
            showToast('Por favor complete los campos obligatorios básicos', 'error');
            return;
        }
        
        // Validar actividad física si se selecciona "Sí"
        if (personalHistoryData.actividadFisica === 'Si') {
            if (!personalHistoryData.tipoActividad || !personalHistoryData.frecuenciaActividad) {
                showToast('Por favor seleccione el tipo de actividad física y la frecuencia', 'error');
                return;
            }
        }
        
        // Enviar datos al servidor
        const response = await fetch('/api/hc/save-personal-history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                personal_history_data: personalHistoryData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Antecedentes Personales Guardados",
                "Antecedentes personales guardados correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar antecedentes personales');
        }
        
    } catch (error) {
        console.error('Error guardando antecedentes personales:', error);
        showToast('Error al guardar antecedentes personales: ' + error.message, 'error');
    }
}

// Función para mostrar/ocultar campo "Otro" según la selección
function toggleOtherOccupationField(parent) {
    const selectElement = document.getElementById(`hcTutorOcupacion${parent.charAt(0).toUpperCase() + parent.slice(1)}`);
    const otherField = document.getElementById(`hcTutorOcupacion${parent.charAt(0).toUpperCase() + parent.slice(1)}Otro`);
    const otherFieldContainer = otherField.parentElement;
    
    if (selectElement.value === 'Ninguno de los anteriores') {
        otherFieldContainer.style.display = 'block';
        otherField.required = true;
        otherField.placeholder = 'Especifique la ocupación...';
    } else {
        otherFieldContainer.style.display = 'none';
        otherField.required = false;
        otherField.value = '';
        otherField.placeholder = '___________________________';
    }
    
    // Recalcular altura después de mostrar/ocultar campos
    recalculateHCExpanderHeight();
}

// Función para calcular edad del tutor automáticamente
function calculateTutorAge() {
    const fechaNacimiento = document.getElementById('hcTutorFechaNacimiento').value;
    const edadField = document.getElementById('hcTutorEdad');
    
    if (fechaNacimiento) {
        const fechaNac = new Date(fechaNacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mes = hoy.getMonth() - fechaNac.getMonth();
        
        if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
            edad--;
        }
        
        edadField.value = edad + ' años';
    } else {
        edadField.value = '';
    }
}

// Función para guardar datos del tutor
async function saveHCTutorData() {
    try {
        
        // Recopilar datos del formulario
        const tutorData = {
            nombre: document.getElementById('hcTutorNombre').value,
            fechaNacimiento: document.getElementById('hcTutorFechaNacimiento').value,
            edad: document.getElementById('hcTutorEdad').value,
            lugarNacimiento: document.getElementById('hcTutorLugarNacimiento').value,
            sexo: document.querySelector('input[name="hcTutorSexo"]:checked')?.value,
            estadoCivil: document.querySelector('input[name="hcTutorEstadoCivil"]:checked')?.value,
            
            // Ocupación Madre
            ocupacionMadre: document.getElementById('hcTutorOcupacionMadre').value,
            ocupacionMadreOtro: document.getElementById('hcTutorOcupacionMadreOtro').value,
            tiempoOcupacionMadre: document.getElementById('hcTutorTiempoOcupacionMadre').value,
            
            // Escolaridad Madre
            escolaridadMadre: document.querySelector('input[name="hcTutorEscolaridadMadre"]:checked')?.value,
            escolaridadMadreOtro: document.getElementById('hcTutorEscolaridadMadreOtro').value,
            
            // Ocupación Padre
            ocupacionPadre: document.getElementById('hcTutorOcupacionPadre').value,
            ocupacionPadreOtro: document.getElementById('hcTutorOcupacionPadreOtro').value,
            tiempoOcupacionPadre: document.getElementById('hcTutorTiempoOcupacionPadre').value,
            
            // Escolaridad Padre
            escolaridadPadre: document.querySelector('input[name="hcTutorEscolaridadPadre"]:checked')?.value,
            escolaridadPadreOtro: document.getElementById('hcTutorEscolaridadPadreOtro').value
        };
        
        
        // Validar campos obligatorios
        if (!tutorData.nombre || !tutorData.fechaNacimiento || !tutorData.sexo) {
            showToast('Por favor complete los campos obligatorios: Nombre, Fecha de Nacimiento y Sexo', 'error');
            return;
        }
        
        // Enviar datos al servidor
        const response = await fetch('/api/hc/save-tutor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: selectedHCPatient.id,
                database_id: selectedHCDatabase.id,
                tutor_data: tutorData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showHCSectionConfirmationModal(
                result,
                "Datos del Tutor Guardados",
                "Datos del tutor guardados correctamente"
            );
        } else {
            throw new Error(result.message || 'Error al guardar datos del tutor');
        }
        
    } catch (error) {
        console.error('Error guardando datos del tutor:', error);
        showToast('Error al guardar datos del tutor: ' + error.message, 'error');
    }
}

async function downloadHCPatientPdf(patient) {
    try {
        if (!selectedHCDatabase) {
            showToast('Seleccione una base de datos primero', 'error');
            return;
        }
        
        const response = await fetch(`/api/hc/export/${selectedHCDatabase.id}/${patient.id}`);
        if (!response.ok) {
            throw new Error('No se pudo generar la historia clínica');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `historia_clinica_${patient.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        showToast('Historia clínica descargada', 'success');
    } catch (error) {
        console.error('Error exportando historia clínica:', error);
        showToast('Error al exportar la historia clínica', 'error');
    }
}

// Hacer las funciones disponibles globalmente
window.toggleHCExpander = toggleHCExpander;
window.showHCTab = showHCTab;
window.filterHCPatients = filterHCPatients;
window.changeHCDatabase = changeHCDatabase;
window.selectAnotherHCPatient = selectAnotherHCPatient;
window.saveHCPatientData = saveHCPatientData;
window.downloadHCTemplate = downloadHCTemplate;
window.calculateTutorAge = calculateTutorAge;
window.saveHCTutorData = saveHCTutorData;
window.toggleOtherOccupationField = toggleOtherOccupationField;
window.toggleCesareaCausa = toggleCesareaCausa;
window.toggleRupturaHoras = toggleRupturaHoras;
window.toggleAnestesiaEspecifique = toggleAnestesiaEspecifique;
window.toggleSitioPartoOtro = toggleSitioPartoOtro;
window.toggleActividadFisicaDetalle = toggleActividadFisicaDetalle;
window.saveHCPersonalHistory = saveHCPersonalHistory;
window.saveHCVaccinationScheme = saveHCVaccinationScheme;
window.toggleAnimalesDetalle = toggleAnimalesDetalle;
window.toggleToxicasDetalle = toggleToxicasDetalle;
window.saveHCPsychomotorDevelopment = saveHCPsychomotorDevelopment;
window.saveHCFamilyHistory = saveHCFamilyHistory;
window.saveHCPhysicalExam = saveHCPhysicalExam;
window.toggleTomaMuestraDetails = toggleTomaMuestraDetails;
window.saveHCNutritionalDiagnosis = saveHCNutritionalDiagnosis;
window.saveHCGeneralDiagnosis = saveHCGeneralDiagnosis;
window.saveHCDoctorData = saveHCDoctorData;
window.downloadHCCompleteTemplate = downloadHCCompleteTemplate;
window.downloadHCPatientPdf = downloadHCPatientPdf;
window.toggleDiabetesDetails = toggleDiabetesDetails;
window.toggleDiabetesTreatment = toggleDiabetesTreatment;
window.togglePreeclampsiaTreatment = togglePreeclampsiaTreatment;
window.toggleInfeccionesTreatment = toggleInfeccionesTreatment;
window.toggleObesidadDetails = toggleObesidadDetails;
window.toggleObesidadTreatment = toggleObesidadTreatment;
window.calculateObesidadIMC = calculateObesidadIMC;
window.toggleSindromeMetabolicoDetails = toggleSindromeMetabolicoDetails;
window.toggleSindromeTreatment = toggleSindromeTreatment;
window.toggleHipertensionTreatment = toggleHipertensionTreatment;
window.toggleHipercolesterolemiaTreatment = toggleHipercolesterolemiaTreatment;
window.toggleHipertrigliceridemiaTreatment = toggleHipertrigliceridemiaTreatment;

// Debug: Verificar que las funciones estén disponibles
