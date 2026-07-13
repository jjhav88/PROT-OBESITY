"""
Módulo de Historia Clínica - Endpoints específicos
Maneja todas las operaciones relacionadas con la historia clínica de los pacientes
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from typing import Dict, Any
import pandas as pd
import os
from datetime import datetime
import json
import re
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import io
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from io import BytesIO

# Router para las rutas de historia clínica
hc_router = APIRouter(prefix="/api/hc", tags=["Historia Clínica"])

# Ruta de metadatos compartida con el resto de la app
METADATA_FILE = os.path.abspath("file_metadata.json")
# Ruta para almacenar datos completos de HC (para exportación PDF)
HC_DATA_DIR = os.path.abspath("hc_data")

# Crear directorio si no existe
if not os.path.exists(HC_DATA_DIR):
    os.makedirs(HC_DATA_DIR)

def load_metadata():
    """Cargar metadatos de archivos procesados"""
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_metadata(metadata):
    """Guardar metadatos de archivos procesados"""
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

def get_hc_data_file_path(database_id: str, patient_id: str) -> str:
    """Obtener ruta del archivo JSON para datos completos de HC de un paciente"""
    return os.path.join(HC_DATA_DIR, f"{database_id}_{patient_id}.json")

def load_hc_complete_data(database_id: str, patient_id: str) -> Dict[str, Any]:
    """Cargar todos los datos de HC de un paciente (para exportación PDF)"""
    file_path = get_hc_data_file_path(database_id, patient_id)
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_hc_complete_data(database_id: str, patient_id: str, section: str, data: Dict[str, Any]):
    """Guardar datos completos de una sección de HC (para exportación PDF)"""
    file_path = get_hc_data_file_path(database_id, patient_id)
    
    # Cargar datos existentes
    complete_data = load_hc_complete_data(database_id, patient_id)
    
    # Actualizar la sección específica
    complete_data[section] = data
    complete_data['last_updated'] = datetime.now().isoformat()
    
    # Guardar
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(complete_data, f, ensure_ascii=False, indent=2)

def clean_patient_data_columns(database_id: str):
    """
    Eliminar columnas de 'Datos del Paciente' de la base de datos Excel.
    Estas columnas no deben estar en BD según las especificaciones.
    """
    try:
        metadata = load_metadata()
        
        # Buscar la base de datos
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            return False, "Base de datos no encontrada"
        
        file_path = db_info.get('file_path')
        if not file_path or not os.path.exists(file_path):
            return False, "Archivo de base de datos no encontrado"
        
        # Leer el archivo Excel
        df = pd.read_excel(file_path)
        
        # Columnas de "Datos del Paciente" que deben eliminarse
        columns_to_remove = [
            'HC_Nombre_Paciente',
            'HC_NSS',
            'HC_ID_Paciente',
            'HC_Fecha_Nacimiento',
            'HC_Domicilio_Principal',
            'HC_Domicilio_Alterno',
            'HC_Nombre_Familiar',
            'HC_Telefono',
            'HC_Celular',
            'HC_Correo',
            'HC_Realizo_HC',
            'HC_Firma_MPSS',
            'HC_Fecha_Registro'
        ]
        
        # Filtrar solo las columnas que existen en el DataFrame
        columns_to_drop = [col for col in columns_to_remove if col in df.columns]
        
        if not columns_to_drop:
            return True, "No hay columnas de 'Datos del Paciente' para eliminar"
        
        # Eliminar las columnas
        df = df.drop(columns=columns_to_drop)
        
        # Guardar el archivo actualizado
        df.to_excel(file_path, index=False)
        
        return True, f"Se eliminaron {len(columns_to_drop)} columnas: {', '.join(columns_to_drop)}"
        
    except Exception as e:
        return False, f"Error al limpiar columnas: {str(e)}"

@hc_router.post("/clean-patient-columns/{database_id}")
async def clean_patient_columns_endpoint(database_id: str):
    """
    Endpoint para eliminar columnas de 'Datos del Paciente' de la base de datos.
    Estas columnas no deben estar en BD según las especificaciones.
    """
    try:
        success, message = clean_patient_data_columns(database_id)
        
        if success:
            return {
                "success": True,
                "message": message,
                "database_id": database_id
            }
        else:
            raise HTTPException(status_code=400, detail=message)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al limpiar columnas: {str(e)}")

@hc_router.get("/databases")
async def get_hc_databases():
    """Obtener lista de bases de datos disponibles para historia clínica"""
    try:
        metadata = load_metadata()
        return {
            "success": True,
            "files": metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cargando bases de datos: {str(e)}")

@hc_router.get("/patients/{database_id}")
async def get_hc_patients(database_id: str):
    """Obtener lista de pacientes de una base de datos específica"""
    try:
        metadata = load_metadata()
        
        # Buscar la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Buscar columna de ID de paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        
        # Obtener lista de pacientes únicos
        patients = []
        for _, row in df.iterrows():
            patient_id = str(row[patient_id_col]).strip()
            if patient_id and patient_id != '':
                # Verificar si el paciente ya tiene historia clínica
                # Pasar database_id para verificar archivo JSON
                has_hc = check_patient_has_hc(df, patient_id, database_id)
                
                patients.append({
                    "id": patient_id,
                    "has_hc": has_hc
                })
        
        # Eliminar duplicados
        unique_patients = []
        seen_ids = set()
        for patient in patients:
            if patient["id"] not in seen_ids:
                unique_patients.append(patient)
                seen_ids.add(patient["id"])
        
        return {
            "success": True,
            "patients": unique_patients,
            "database": database_file
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo pacientes: {str(e)}")

def check_patient_has_hc(df, patient_id, database_id=None):
    """Verificar si un paciente ya tiene historia clínica registrada
    
    Primero verifica si existe el archivo JSON de HC (más confiable).
    Si no existe, verifica las columnas que SÍ se guardan en BD.
    """
    # Primero: Verificar si existe el archivo JSON de HC (más confiable)
    if database_id:
        hc_data = load_hc_complete_data(database_id, patient_id)
        if hc_data and len(hc_data) > 0:
            # Si tiene al menos una sección guardada (además de last_updated), tiene HC
            sections = [k for k in hc_data.keys() if k != 'last_updated']
            if sections:
                return True
    
    # Segundo: Verificar columnas que SÍ se guardan en BD
    # Columnas de Datos del Tutor
    tutor_columns = ['escolaridad_m', 'escolaridad_p']
    # Columnas de Antecedentes Personales
    personal_columns = [
        'embarazo_numero', 'curso_normal', 'semanas_gestacion', 'termino',
        'sitio_parto', 'tipo_parto', 'peso_nacer', 'talla_nacer',
        'ruptura_membrana', 'complicaciones', 'tamiz_neonatal', 'result_tamiz',
        'lactancia_materna', 'ablactacion', 'actividad_fisica'
    ]
    # Columnas de Desarrollo Psicomotor
    psychomotor_columns = ['escolaridad_actual', 'exp_sust_tox']
    # Columnas de Antecedentes Heredofamiliares
    family_columns = [
        'diabetes_m', 'preclamsia_m', 'infecc_embarazo_m', 'obes_m', 'sm_m',
        'HTA_m', 'hipercolesterolemia_m', 'hipertrigli_m',
        'diabetes_p', 'obes_p', 'sm_p', 'HTA_p', 'hipercolesterolemia_p', 'hipertrigli_p'
    ]
    
    all_hc_columns = tutor_columns + personal_columns + psychomotor_columns + family_columns
    
    # Buscar el paciente
    id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
    if not id_columns:
        id_columns = [col for col in df.columns if 'id' in col.lower()]
    
    if not id_columns:
        return False
    
    patient_id_col = id_columns[0]
    patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
    
    if patient_row.empty:
        return False
    
    # Verificar si tiene datos de historia clínica en alguna de las columnas que SÍ se guardan
    for col in all_hc_columns:
        if col in df.columns:
            value = patient_row.iloc[0][col]
            if pd.notna(value) and str(value).strip() != '':
                return True
    
    return False

@hc_router.get("/patient-data/{database_id}/{patient_id}")
async def get_patient_hc_data(database_id: str, patient_id: str):
    """Obtener TODOS los datos de historia clínica de un paciente desde el JSON completo"""
    try:
        metadata = load_metadata()
        
        # Buscar la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar TODOS los datos del JSON completo
        complete_hc_data = load_hc_complete_data(database_id, patient_id)
        
        # Si no hay datos en JSON, devolver estructura vacía
        if not complete_hc_data:
            return {
                "success": True,
                "patient_id": patient_id,
                "database_id": database_id,
                "hc_data": {
                    "datos_paciente": {},
                    "datos_tutor": {},
                    "antecedentes_personales": {},
                    "esquema_vacunacion": {},
                    "desarrollo_psicomotor": {},
                    "antecedentes_heredofamiliares": {},
                    "exploracion_fisica": {},
                    "diagnostico_nutricional": {},
                    "diagnostico_general": {},
                    "datos_doctor": {}
                }
            }
        
        return {
            "success": True,
            "patient_id": patient_id,
            "database_id": database_id,
            "hc_data": complete_hc_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo datos de HC: {str(e)}")

@hc_router.get("/export/{database_id}/{patient_id}")
async def export_patient_hc(database_id: str, patient_id: str):
    """Generar PDF con TODOS los datos de la historia clínica guardados en JSON completo"""
    try:
        # Cargar TODOS los datos del JSON completo
        complete_hc_data = load_hc_complete_data(database_id, patient_id)
        
        if not complete_hc_data:
            raise HTTPException(status_code=404, detail="No se encontraron datos de historia clínica para este paciente")
        
        # Crear PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20 * mm,
            leftMargin=20 * mm,
            topMargin=20 * mm,
            bottomMargin=20 * mm
        )
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'HCTitle',
            parent=styles['Heading1'],
            fontSize=16,
            alignment=TA_CENTER,
            spaceAfter=15
        )
        
        section_style = ParagraphStyle(
            'HCSection',
            parent=styles['Heading2'],
            fontSize=13,
            spaceBefore=15,
            spaceAfter=8,
            textColor=colors.darkblue
        )
        
        field_style = ParagraphStyle(
            'HCField',
            parent=styles['Normal'],
            fontSize=11,
            leading=16,
            spaceAfter=4
        )
        
        def format_value(value):
            if value is None or value == '':
                return '____________________________'
            if isinstance(value, list):
                return ', '.join(str(v) for v in value) if value else '____________________________'
            return str(value)
        
        def add_section_data(section_name, section_data, elements):
            """Agregar datos de una sección al PDF"""
            if not section_data:
                return
            
            elements.append(Paragraph(section_name, section_style))
            elements.append(Spacer(1, 8))
            
            for key, value in section_data.items():
                if value is not None and value != '':
                    # Formatear el nombre del campo (de camelCase a título)
                    field_label = re.sub(r'([A-Z])', r' \1', key).title()
                    elements.append(Paragraph(f"<b>{field_label}:</b> {format_value(value)}", field_style))
            
            elements.append(Spacer(1, 12))
        
        elements = []
        elements.append(Paragraph("Historia Clínica Completa", title_style))
        elements.append(Paragraph(f"Paciente ID: {patient_id}", field_style))
        elements.append(Spacer(1, 15))
        
        # Agregar todas las secciones disponibles
        section_names = {
            'datos_paciente': '1. DATOS DEL PACIENTE',
            'datos_tutor': '2. DATOS DEL TUTOR',
            'antecedentes_personales': '3. ANTECEDENTES PERSONALES',
            'esquema_vacunacion': '4. ESQUEMA DE VACUNACIÓN',
            'desarrollo_psicomotor': '5. DESARROLLO PSICOMOTOR',
            'antecedentes_heredofamiliares': '6. ANTECEDENTES HEREDOFAMILIARES',
            'exploracion_fisica': '7. EXPLORACIÓN FÍSICA',
            'diagnostico_nutricional': '8. DIAGNÓSTICO NUTRICIONAL (TAMIZ)',
            'diagnostico_general': '9. DIAGNÓSTICO GENERAL',
            'datos_doctor': '10. DATOS DEL DOCTOR'
        }
        
        for section_key, section_title in section_names.items():
            if section_key in complete_hc_data:
                add_section_data(section_title, complete_hc_data[section_key], elements)
        
        doc.build(elements)
        pdf_content = buffer.getvalue()
        buffer.close()
        
        filename = f"historia_clinica_{patient_id}.pdf"
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exportando historia clínica: {str(e)}")

@hc_router.post("/save-patient-data")
async def save_patient_hc_data(data: dict):
    """Guardar datos de la sección Datos del Paciente"""
    try:
        database_id = data.get('database_id')
        patient_id = data.get('patient_id')
        hc_data = data.get('hc_data', {})
        
        if not database_id or not patient_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        metadata = load_metadata()
        
        # Buscar la base de datos
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        file_path = db_info.get('file_path')
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        # Leer el archivo Excel
        df = pd.read_excel(file_path)
        
        # Buscar el paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        
        if patient_row.empty:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        # NOTA: Según especificaciones, "Datos del Paciente" NO se guarda en BD
        # Solo se guarda en JSON completo para exportación PDF
        
        # Guardar TODOS los datos en JSON completo (para exportación PDF)
        save_hc_complete_data(database_id, patient_id, 'datos_paciente', hc_data)
        
        return {
            "success": True,
            "message": "Datos del paciente guardados correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando datos: {str(e)}")

@hc_router.get("/check-patient-hc/{database_id}/{patient_id}")
async def check_patient_has_hc_endpoint(database_id: str, patient_id: str):
    """Verificar si un paciente ya tiene historia clínica registrada"""
    try:
        metadata = load_metadata()
        
        # Buscar la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Pasar database_id para verificar archivo JSON
        has_hc = check_patient_has_hc(df, patient_id, database_id)
        
        return {
            "has_hc": has_hc,
            "patient_id": patient_id,
            "database_id": database_id,
            "message": "Verificación completada"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verificando HC: {str(e)}")

# Endpoint para guardar antecedentes personales
@hc_router.post("/save-personal-history")
async def save_personal_history(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        personal_history_data = data.get('personal_history_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # Guardar en JSON completo (para exportación PDF)
        save_hc_complete_data(database_id, patient_id, 'antecedentes_personales', personal_history_data)
        
        # Guardar en BD solo los campos especificados
        metadata = load_metadata()
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        file_path = db_info.get('file_path')
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        # Limpiar columnas de "Datos del Paciente" automáticamente la primera vez
        if not db_info.get('hc_columns_cleaned', False):
            clean_patient_data_columns(database_id)
            db_info['hc_columns_cleaned'] = True
            save_metadata(metadata)
        
        df = pd.read_excel(file_path)
        
        # Buscar el paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        # Mapeo de campos del frontend a columnas de BD
        # Para campos que pueden ser arrays (complicaciones), convertir a string separado por comas
        complicaciones = personal_history_data.get('complicaciones', [])
        complicaciones_str = ', '.join(complicaciones) if isinstance(complicaciones, list) else str(complicaciones) if complicaciones else None
        
        # Campos a guardar en BD según especificaciones
        bd_fields = {
            'embarazo_numero': personal_history_data.get('embarazoNumero'),
            'curso_normal': personal_history_data.get('cursoNormal'),
            'semanas_gestacion': personal_history_data.get('semanasGestacion'),
            'termino': personal_history_data.get('termino'),
            'sitio_parto': personal_history_data.get('sitioParto'),
            'tipo_parto': personal_history_data.get('tipoParto'),
            'peso_nacer': personal_history_data.get('pesoNacer'),
            'talla_nacer': personal_history_data.get('tallaNacer'),
            'ruptura_membrana': personal_history_data.get('rupturaMembrana'),
            'complicaciones': complicaciones_str,
            'tamiz_neonatal': personal_history_data.get('tamizNeonatal'),
            'result_tamiz': personal_history_data.get('tamizResultado'),
            'lactancia_materna': personal_history_data.get('lactanciaMaterna'),
            'ablactacion': personal_history_data.get('ablactacion'),
            'actividad_fisica': personal_history_data.get('actividadFisica')
        }
        
        # Asegurar que las columnas existan
        for col_name in bd_fields.keys():
            if col_name not in df.columns:
                df[col_name] = None
        
        # Actualizar datos
        patient_index = patient_row.index[0]
        for col_name, value in bd_fields.items():
            df.at[patient_index, col_name] = value if value else None
        
        # Guardar el archivo
        df.to_excel(file_path, index=False)
        
        return {
            "success": True, 
            "message": "Antecedentes personales guardados correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar antecedentes personales: {str(e)}")

# Endpoint para guardar esquema de vacunación
@hc_router.post("/save-vaccination-scheme")
async def save_vaccination_scheme(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        vaccination_data = data.get('vaccination_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # NOTA: Según especificaciones, "Esquema de Vacunación" NO se guarda en BD
        # Solo se guarda en JSON completo para exportación PDF
        save_hc_complete_data(database_id, patient_id, 'esquema_vacunacion', vaccination_data)
        
        return {
            "success": True, 
            "message": "Esquema de vacunación guardado correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar esquema de vacunación: {str(e)}")

# Endpoint para guardar desarrollo psicomotor
@hc_router.post("/save-psychomotor-development")
async def save_psychomotor_development(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        psychomotor_data = data.get('psychomotor_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # Guardar en JSON completo (para exportación PDF)
        save_hc_complete_data(database_id, patient_id, 'desarrollo_psicomotor', psychomotor_data)
        
        # Guardar en BD solo los campos especificados
        metadata = load_metadata()
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        file_path = db_info.get('file_path')
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Buscar el paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        # Campos a guardar en BD según especificaciones
        bd_fields = {
            'escolaridad_actual': psychomotor_data.get('escolaridadActual'),
            'exp_sust_tox': psychomotor_data.get('exposicionToxicas')
        }
        
        # Asegurar que las columnas existan
        for col_name in bd_fields.keys():
            if col_name not in df.columns:
                df[col_name] = None
        
        # Actualizar datos
        patient_index = patient_row.index[0]
        for col_name, value in bd_fields.items():
            df.at[patient_index, col_name] = value if value else None
        
        # Guardar el archivo
        df.to_excel(file_path, index=False)
        
        return {
            "success": True, 
            "message": "Desarrollo psicomotor guardado correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar desarrollo psicomotor: {str(e)}")

# Endpoint para guardar antecedentes heredofamiliares
@hc_router.post("/save-general-diagnosis")
async def save_general_diagnosis(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        general_diagnosis_data = data.get('general_diagnosis_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # NOTA: Según especificaciones, "Diagnóstico General" NO se guarda en BD
        # Solo se guarda en JSON completo para exportación PDF
        save_hc_complete_data(database_id, patient_id, 'diagnostico_general', general_diagnosis_data)
        
        return {
            "success": True, 
            "message": "Diagnóstico general guardado correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar diagnóstico general: {str(e)}")

# Endpoint para guardar diagnóstico nutricional (TAMIZ)
@hc_router.post("/save-nutritional-diagnosis")
async def save_nutritional_diagnosis(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        nutritional_diagnosis_data = data.get('nutritional_diagnosis_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # NOTA: Según especificaciones, "Diagnóstico Nutricional (TAMIZ)" NO se guarda en BD
        # Solo se guarda en JSON completo para exportación PDF
        save_hc_complete_data(database_id, patient_id, 'diagnostico_nutricional', nutritional_diagnosis_data)
        
        return {
            "success": True, 
            "message": "Diagnóstico nutricional guardado correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar diagnóstico nutricional: {str(e)}")

# Endpoint para guardar exploración física
@hc_router.post("/save-physical-exam")
async def save_physical_exam(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        physical_exam_data = data.get('physical_exam_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # NOTA: Según especificaciones, "Exploración Física" NO se guarda en BD
        # Solo se guarda en JSON completo para exportación PDF
        save_hc_complete_data(database_id, patient_id, 'exploracion_fisica', physical_exam_data)
        
        return {
            "success": True, 
            "message": "Exploración física guardada correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar exploración física: {str(e)}")
# Endpoint para guardar antecedentes heredofamiliares
@hc_router.post("/save-family-history")
async def save_family_history(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        family_history_data = data.get('family_history_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # Guardar en JSON completo (para exportación PDF)
        save_hc_complete_data(database_id, patient_id, 'antecedentes_heredofamiliares', family_history_data)
        
        # Guardar en BD solo los campos especificados
        metadata = load_metadata()
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        file_path = db_info.get('file_path')
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Buscar el paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        # Campos a guardar en BD según especificaciones
        bd_fields = {
            # MADRE
            'diabetes_m': family_history_data.get('diabetesMaterna'),
            'preclamsia_m': family_history_data.get('preeclampsiaMaterna'),
            'infecc_embarazo_m': family_history_data.get('infeccionesEmbarazoMaterna'),
            'obes_m': family_history_data.get('obesidadMaterna'),
            'sm_m': family_history_data.get('sindromeMetabolicoMaterna'),
            'HTA_m': family_history_data.get('hipertensionMaterna'),
            'hipercolesterolemia_m': family_history_data.get('hipercolesterolemiaMaterna'),
            'hipertrigli_m': family_history_data.get('hipertrigliceridemiaMaterna'),
            # PADRE
            'diabetes_p': family_history_data.get('diabetesPaterna'),
            'obes_p': family_history_data.get('obesidadPaterna'),
            'sm_p': family_history_data.get('sindromeMetabolicoPaterna'),
            'HTA_p': family_history_data.get('hipertensionPaterna'),
            'hipercolesterolemia_p': family_history_data.get('hipercolesterolemiaPaterna'),
            'hipertrigli_p': family_history_data.get('hipertrigliceridemiaPaterna')
        }
        
        # Asegurar que las columnas existan
        for col_name in bd_fields.keys():
            if col_name not in df.columns:
                df[col_name] = None
        
        # Actualizar datos
        patient_index = patient_row.index[0]
        for col_name, value in bd_fields.items():
            df.at[patient_index, col_name] = value if value else None
        
        # Guardar el archivo
        df.to_excel(file_path, index=False)
        
        return {
            "success": True, 
            "message": "Antecedentes heredofamiliares guardados correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar antecedentes heredofamiliares: {str(e)}")

# Endpoint para guardar datos del tutor
@hc_router.post("/save-tutor")
async def save_tutor_data(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        tutor_data = data.get('tutor_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # Guardar en JSON completo (para exportación PDF)
        save_hc_complete_data(database_id, patient_id, 'datos_tutor', tutor_data)
        
        # Guardar en BD solo los campos especificados
        metadata = load_metadata()
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        file_path = db_info.get('file_path')
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Buscar el paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        # Campos a guardar en BD
        bd_fields = {
            'escolaridad_m': tutor_data.get('escolaridadMadre'),
            'escolaridad_p': tutor_data.get('escolaridadPadre')
        }
        
        # Asegurar que las columnas existan
        for col_name in bd_fields.keys():
            if col_name not in df.columns:
                df[col_name] = None
        
        # Actualizar datos
        patient_index = patient_row.index[0]
        for col_name, value in bd_fields.items():
            df.at[patient_index, col_name] = value if value else None
        
        # Guardar el archivo
        df.to_excel(file_path, index=False)
        
        return {
            "success": True, 
            "message": "Datos del tutor guardados correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar datos del tutor: {str(e)}")

# Endpoint para guardar datos del doctor
@hc_router.post("/save-doctor-data")
async def save_doctor_data(data: Dict[str, Any]):
    try:
        patient_id = data.get('patient_id')
        database_id = data.get('database_id')
        doctor_data = data.get('doctor_data', {})
        
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        # NOTA: Según especificaciones, "Datos del Doctor" NO se guarda en BD
        # Solo se guarda en JSON completo para exportación PDF
        save_hc_complete_data(database_id, patient_id, 'datos_doctor', doctor_data)
        
        return {
            "success": True, 
            "message": "Datos del doctor guardados correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar datos del doctor: {str(e)}")

# Endpoint para generar PDF completo de Historia Clínica
@hc_router.get("/download-hc-template")
async def download_hc_template():
    try:
        
        # Crear buffer para el PDF
        buffer = io.BytesIO()
        
        # Crear documento PDF
        doc = SimpleDocTemplate(buffer, pagesize=A4, 
                              rightMargin=15*mm, leftMargin=15*mm,
                              topMargin=15*mm, bottomMargin=15*mm)
        
        # Obtener estilos
        styles = getSampleStyleSheet()
        
        # Crear estilos personalizados
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=15,
            alignment=TA_CENTER,
            textColor=colors.darkblue,
            fontName='Helvetica-Bold'
        )
        
        section_style = ParagraphStyle(
            'CustomSection',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=8,
            spaceBefore=12,
            textColor=colors.darkblue,
            fontName='Helvetica-Bold',
            borderWidth=1,
            borderColor=colors.darkblue,
            borderPadding=8,
            backColor=colors.lightgrey
        )
        
        subsection_style = ParagraphStyle(
            'CustomSubsection',
            parent=styles['Heading3'],
            fontSize=12,
            spaceAfter=6,
            spaceBefore=8,
            textColor=colors.darkgreen,
            fontName='Helvetica-Bold'
        )
        
        field_style = ParagraphStyle(
            'CustomField',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=4,
            leftIndent=5,
            fontName='Helvetica'
        )
        
        label_style = ParagraphStyle(
            'CustomLabel',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=2,
            fontName='Helvetica-Bold'
        )
        
        # Lista para almacenar elementos del PDF
        story = []
        
        # TÍTULO PRINCIPAL
        story.append(Paragraph("HISTORIA CLÍNICA", title_style))
        story.append(Spacer(1, 15))
        
        # SECCIÓN 1: DATOS DEL PACIENTE
        story.append(Paragraph("1. DATOS DEL PACIENTE", section_style))
        
        patient_fields = [
            ("Nombre del paciente:", "_________________________________________________"),
            ("Número de Seguro Social (NSS):", "_________________________________________________"),
            ("ID_Paciente:", "_________________________________________________"),
            ("Domicilio Principal:", "_________________________________________________"),
            ("Domicilio Alterno:", "_________________________________________________"),
            ("Nombre del Familiar Responsable:", "_________________________________________________"),
            ("Teléfono:", "_________________ Celular: _________________ Correo Electrónico: _________________"),
            ("Realizó Historia Clínica:", "_________________________________________________"),
            ("Firma del MPSS:", "_________________________________________________")
        ]
        
        for label, field in patient_fields:
            story.append(Paragraph(f"<b>{label}</b> {field}", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 2: DATOS DEL TUTOR
        story.append(Paragraph("2. DATOS DEL TUTOR", section_style))
        
        # Datos básicos del tutor
        story.append(Paragraph("<b>Nombre Completo:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Fecha de Nacimiento:</b> _________________ <b>Edad:</b> _________________ <b>Sexo:</b> ○ M ○ F", field_style))
        story.append(Paragraph("<b>Lugar de Nacimiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Estado Civil:</b> ○ Casado/a ○ Soltero/a ○ Divorciado/a ○ Viudo/a ○ Unión Libre", field_style))
        
        # Datos de la madre
        story.append(Paragraph("<b>Ocupación Actual (MADRE):</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("○ Funcionarios, directores y jefes ○ Profesionistas y técnicos ○ Trabajadores auxiliares en actividades administrativas", field_style))
        story.append(Paragraph("○ Comerciantes, empleados en ventas y agentes de ventas ○ Trabajadores en servicios personales y de vigilancia", field_style))
        story.append(Paragraph("○ Trabajadores en actividades agrícolas, ganaderas, forestales, caza y pesca ○ Trabajadores artesanales", field_style))
        story.append(Paragraph("○ Operadores de maquinaria industrial, ensambladores, y conductores de transporte ○ Trabajadores en actividades elementales y de apoyo", field_style))
        story.append(Paragraph("○ Ama de casa ○ Ninguno de los anteriores", field_style))
        story.append(Paragraph("<b>Otro (Especifique):</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Tiempo de Ocupación:</b> _________________ años", field_style))
        
        story.append(Paragraph("<b>Escolaridad (MADRE):</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("○ Primaria Completa ○ Primaria Incompleta ○ Secundaria Completa ○ Secundaria Incompleta", field_style))
        story.append(Paragraph("○ Preparatoria Completa ○ Preparatoria Incompleta ○ Licenciatura Completa ○ Licenciatura Incompleta", field_style))
        story.append(Paragraph("○ Posgrado Completo ○ Posgrado Incompleta ○ Analfabetismo ○ Ninguno de los anteriores", field_style))
        story.append(Paragraph("<b>Otro (Especifique):</b> _________________________________________________", field_style))
        
        # Datos del padre
        story.append(Paragraph("<b>Ocupación Actual (PADRE):</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("○ Funcionarios, directores y jefes ○ Profesionistas y técnicos ○ Trabajadores auxiliares en actividades administrativas", field_style))
        story.append(Paragraph("○ Comerciantes, empleados en ventas y agentes de ventas ○ Trabajadores en servicios personales y de vigilancia", field_style))
        story.append(Paragraph("○ Trabajadores en actividades agrícolas, ganaderas, forestales, caza y pesca ○ Trabajadores artesanales", field_style))
        story.append(Paragraph("○ Operadores de maquinaria industrial, ensambladores, y conductores de transporte ○ Trabajadores en actividades elementales y de apoyo", field_style))
        story.append(Paragraph("○ Ama de casa ○ Ninguno de los anteriores", field_style))
        story.append(Paragraph("<b>Otro (Especifique):</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Tiempo de Ocupación:</b> _________________ años", field_style))
        
        story.append(Paragraph("<b>Escolaridad (PADRE):</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("○ Primaria Completa ○ Primaria Incompleta ○ Secundaria Completa ○ Secundaria Incompleta", field_style))
        story.append(Paragraph("○ Preparatoria Completa ○ Preparatoria Incompleta ○ Licenciatura Completa ○ Licenciatura Incompleta", field_style))
        story.append(Paragraph("○ Posgrado Completo ○ Posgrado Incompleta ○ Analfabetismo ○ Ninguno de los anteriores", field_style))
        story.append(Paragraph("<b>Otro (Especifique):</b> _________________________________________________", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 3: ANTECEDENTES PERSONALES
        story.append(Paragraph("3. ANTECEDENTES PERSONALES", section_style))
        
        # Subsección PERINATALES
        story.append(Paragraph("<b>PERINATALES</b>", subsection_style))
        
        story.append(Paragraph("<b>Embarazo No.:</b> _________________ <b>Curso normal:</b> ○ Sí ○ No", field_style))
        story.append(Paragraph("<b>Semanas de gestación:</b> _________________ <b>Término:</b> ○ Término ○ Pretérmino ○ Postérmino", field_style))
        
        story.append(Paragraph("<b>Sitio de atención del parto:</b>", subsection_style))
        story.append(Paragraph("○ Hospital ○ Clínica ○ Casa ○ Calle ○ Otro", field_style))
        story.append(Paragraph("<b>Otro (Especifique):</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Tipo de Parto:</b>", subsection_style))
        story.append(Paragraph("○ Parto Natural ○ Cesárea", field_style))
        story.append(Paragraph("<b>Causa de Cesárea:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Peso al Nacer:</b> _________________ kg <b>Talla al Nacer:</b> _________________ cm", field_style))
        
        story.append(Paragraph("<b>Ruptura Prematura de Membrana:</b> ○ Sí ○ No", field_style))
        story.append(Paragraph("<b>Horas:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Anestesia:</b> ○ Sí ○ No", field_style))
        story.append(Paragraph("<b>Especifique:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Complicaciones:</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("☐ Apnea Neonatal ☐ Convulsiones ☐ Hemorragias ☐ Ictericia ☐ Cianosis ☐ Otros", field_style))
        story.append(Paragraph("<b>Especificar tiempo, causa y tratamiento:</b>", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        
        # Subsección NO PATOLÓGICOS
        story.append(Paragraph("<b>NO PATOLÓGICOS</b>", subsection_style))
        
        # Alimentación
        story.append(Paragraph("<b>Alimentación</b>", subsection_style))
        story.append(Paragraph("<b>Lactancia materna:</b> ○ Sí ○ No <b>duración:</b> _________________", field_style))
        story.append(Paragraph("<b>Ablactación:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Consumo semanal:</b>", subsection_style))
        story.append(Paragraph("<b>Carnes rojas:</b> ___ días <b>carnes blancas:</b> ___ días <b>leche:</b> ___ días", field_style))
        story.append(Paragraph("<b>huevo:</b> ___ días <b>frutas:</b> ___ días <b>cereales:</b> ___ días <b>verduras:</b> ___ días", field_style))
        story.append(Paragraph("<b>leguminosas:</b> ___ días <b>refresco y otras bebidas dulces:</b> ___ días <b>agua:</b> ___ días", field_style))
        story.append(Paragraph("<b>frituras:</b> ___ días <b>dulces:</b> ___ días <b>embutidos:</b> ___ días <b>derivados del maíz:</b> ___ días", field_style))
        
        # Actividad física
        story.append(Paragraph("<b>Actividad física</b>", subsection_style))
        story.append(Paragraph("<b>¿Realiza actividad física?:</b> ○ Sí ○ No", field_style))
        
        story.append(Paragraph("<b>¿Qué actividades físicas realiza?:</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("☐ Football ☐ Baseball ☐ Kárate ☐ Boxeo ☐ Atletismo ☐ Gimnasia ☐ Ballet ☐ Danza", field_style))
        
        story.append(Paragraph("<b>Frecuencia de actividad física:</b> _________________ días a la semana", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 4: ESQUEMA DE VACUNACIÓN
        story.append(Paragraph("4. ESQUEMA DE VACUNACIÓN", section_style))
        
        # Crear tabla de vacunación
        vaccination_data = [
            ['Vacuna', 'Dosis', 'Edad Oportuna', 'Aplicada'],
            ['BCG', 'Única', 'Al nacer', '☐'],
            ['Hepatitis B', 'Única', 'Al nacer', '☐'],
            ['Hexavalente DPaT+VPI+Hib+HepB', 'Primera', '2 meses', '☐'],
            ['', 'Segunda', '4 meses', '☐'],
            ['', 'Tercera', '6 meses', '☐'],
            ['', 'Refuerzo', '18 meses', '☐'],
            ['DPT', 'Refuerzo', '4 años', '☐'],
            ['Rotavirus', 'Primera', '2 meses', '☐'],
            ['', 'Segunda', '4 meses', '☐'],
            ['Neumocócica conjugada', 'Primera', '2 meses', '☐'],
            ['', 'Segunda', '4 meses', '☐'],
            ['SRP (Triple viral)', 'Primera', '12 meses', '☐'],
            ['', 'Segunda', '18 meses*', '☐'],
            ['', 'Refuerzo', '6 años**', '☐'],
            ['Influenza', 'Primera', 'A partir de los 6 meses', '☐'],
            ['', 'Segunda', 'A las 4 semanas', '☐'],
            ['', 'Dosis anual', '1, 2, 3, 4 años', '☐'],
            ['', 'Primera', '5-9 años con riesgo', '☐'],
            ['', 'Segunda', '', '☐'],
            ['', 'Dosis anual', '', '☐'],
            ['COVID-19', 'Esquema primario', 'A partir de los 5 años', '☐'],
            ['', 'Segunda', '', '☐'],
            ['', 'Tercera', '', '☐'],
            ['', 'Refuerzo', 'Niñas y niños con factores de riesgo, 6 meses después de la última dosis', '☐']
        ]
        
        vaccination_table = Table(vaccination_data, colWidths=[2.2*inch, 1.3*inch, 2.2*inch, 0.8*inch])
        vaccination_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.white]),
        ]))
        
        story.append(vaccination_table)
        story.append(Spacer(1, 10))
        
        # SECCIÓN 5: DESARROLLO PSICOMOTOR
        story.append(Paragraph("5. DESARROLLO PSICOMOTOR", section_style))
        
        story.append(Paragraph("<b>Desarrollo psicomotor (precisar edad en meses):</b>", subsection_style))
        story.append(Paragraph("<b>Siguió objetos:</b> _________________ meses <b>Sonrió:</b> _________________ meses", field_style))
        story.append(Paragraph("<b>Sostuvo la cabeza:</b> _________________ meses <b>Se sentó:</b> _________________ meses", field_style))
        story.append(Paragraph("<b>Caminó:</b> _________________ meses", field_style))
        
        story.append(Paragraph("<b>Control de esfínteres:</b>", subsection_style))
        story.append(Paragraph("<b>Vesical:</b> _________________ meses <b>Anal:</b> _________________ meses", field_style))
        
        story.append(Paragraph("<b>Escolaridad actual:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Años escolares reprobados:</b> _________________", field_style))
        
        story.append(Paragraph("<b>Datos anormales en el desarrollo:</b>", subsection_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        
        story.append(Paragraph("<b>Convivencia con animales:</b> ○ Sí ○ No <b>Cual(es):</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Exposición a substancias tóxicas:</b> ○ Sí ○ No <b>Cuales:</b> _________________________________________________", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 6: ANTECEDENTES HEREDOFAMILIARES
        story.append(Paragraph("6. ANTECEDENTES HEREDOFAMILIARES", section_style))
        
        # MATERNOS
        story.append(Paragraph("<b>MATERNOS</b>", subsection_style))
        story.append(Paragraph("<b>Edad:</b> _________________", field_style))
        
        story.append(Paragraph("<b>¿Padece o padeció algún tipo de diabetes?:</b> ○ Sí ○ No", field_style))
        story.append(Paragraph("<b>Tipo de diabetes:</b> ○ DM-I ○ DM-II ○ Gestacional", field_style))
        story.append(Paragraph("<b>Tratamiento:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Preeclampsia:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Infecciones durante el embarazo:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Peso subido en embarazo:</b> _________________ kg", field_style))
        
        story.append(Paragraph("<b>Obesidad:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Síndrome metabólico:</b> ○ Sí ○ No", field_style))
        
        story.append(Paragraph("<b>Patologías:</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("☐ HTA ☐ Obesidad ☐ Diabetes Mellitus-II ☐ Hiperglucemia ☐ Hipertrigliceridemia", field_style))
        story.append(Paragraph("<b>Tratamiento:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Hipertensión arterial:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Hipercolesterolemia:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Hipertrigliceridemia:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Otras patologías:</b> _________________________________________________", field_style))
        
        # PATERNOS
        story.append(Paragraph("<b>PATERNOS</b>", subsection_style))
        story.append(Paragraph("<b>Edad:</b> _________________", field_style))
        
        story.append(Paragraph("<b>¿Padece o padeció algún tipo de diabetes?:</b> ○ Sí ○ No", field_style))
        story.append(Paragraph("<b>Tipo de diabetes:</b> ○ DM-I ○ DM-II", field_style))
        story.append(Paragraph("<b>Tratamiento:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Obesidad:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Síndrome metabólico:</b> ○ Sí ○ No", field_style))
        
        story.append(Paragraph("<b>Patologías:</b>", subsection_style))
        story.append(Spacer(1, 5))
        story.append(Paragraph("☐ HTA ☐ Obesidad ☐ Diabetes Mellitus-II ☐ Hiperglucemia ☐ Hipertrigliceridemia", field_style))
        story.append(Paragraph("<b>Tratamiento:</b> _________________________________________________", field_style))
        
        story.append(Paragraph("<b>Hipertensión arterial:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Hipercolesterolemia:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Hipertrigliceridemia:</b> ○ Sí ○ No <b>Tratamiento:</b> _________________________________________________", field_style))
        story.append(Paragraph("<b>Otras patologías:</b> _________________________________________________", field_style))
        
        # HERMANOS
        story.append(Paragraph("<b>HERMANOS</b>", subsection_style))
        hermanos_fields = [
            ("Edad:", "_________________"),
            ("¿Padece o padeció algún tipo de diabetes?:", "○ Sí ○ No"),
            ("Tipo de diabetes:", "○ DM-I ○ DM-II"),
            ("Tratamiento:", "_________________________________________________"),
            ("Obesidad:", "○ Sí ○ No Tratamiento: _________________________________________________"),
            ("Síndrome metabólico:", "○ Sí ○ No"),
            ("Patologías:", "☐ HTA ☐ Obesidad ☐ Diabetes Mellitus-II ☐ Hiperglucemia ☐ Hipertrigliceridemia"),
            ("Tratamiento:", "_________________________________________________"),
            ("Hipertensión arterial:", "○ Sí ○ No Tratamiento: _________________________________________________"),
            ("Hipercolesterolemia:", "○ Sí ○ No Tratamiento: _________________________________________________"),
            ("Hipertrigliceridemia:", "○ Sí ○ No Tratamiento: _________________________________________________"),
            ("Otras patologías:", "_________________________________________________")
        ]
        
        for label, field in hermanos_fields:
            story.append(Paragraph(f"<b>{label}</b> {field}", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 7: EXPLORACIÓN FÍSICA
        story.append(Paragraph("7. EXPLORACIÓN FÍSICA", section_style))
        
        exploracion_fields = [
            ("Peso:", "_________________ kg Talla: _________________ cm"),
            ("Perímetro Cefálico:", "_________________ cm Perímetro Braquial: _________________ cm"),
            ("Frecuencia Cardiaca:", "_________________ lpm Frecuencia Respiratoria: _________________ rpm"),
            ("Temperatura:", "_________________ °C Oximetría de pulso: _________________ %")
        ]
        
        for label, field in exploracion_fields:
            story.append(Paragraph(f"<b>{label}</b> {field}", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 8: DIAGNÓSTICO NUTRICIONAL (TAMIZ)
        story.append(Paragraph("8. DIAGNÓSTICO NUTRICIONAL (TAMIZ)", section_style))
        
        tamiz_fields = [
            ("¿Se tomó muestra?:", "○ Sí ○ No"),
            ("Fecha de toma de muestra:", "_________________________________________________"),
            ("Glucosa Tamiz:", "_________________ mg/dL"),
            ("Colesterol Tamiz:", "_________________ mg/dL"),
            ("Triglicéridos Tamiz:", "_________________ mg/dL"),
            ("HDL Tamiz:", "_________________ mg/dL")
        ]
        
        for label, field in tamiz_fields:
            story.append(Paragraph(f"<b>{label}</b> {field}", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 9: DIAGNÓSTICO GENERAL
        story.append(Paragraph("9. DIAGNÓSTICO GENERAL", section_style))
        
        story.append(Paragraph("<b>Diagnósticos Previos:</b>", subsection_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Spacer(1, 8))
        
        story.append(Paragraph("<b>Diagnósticos Actuales:</b>", subsection_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        story.append(Paragraph("_________________________________________________", field_style))
        
        story.append(Spacer(1, 10))
        
        # SECCIÓN 10: DATOS DEL DOCTOR
        story.append(Paragraph("10. DATOS DEL DOCTOR", section_style))
        
        doctor_fields = [
            ("Nombre del médico que realizó la historia:", "_________________________________________________"),
            ("Nombre del médico que revisó la historia:", "_________________________________________________"),
            ("Firma:", "_________________________________________________")
        ]
        
        for label, field in doctor_fields:
            story.append(Paragraph(f"<b>{label}</b> {field}", field_style))
        
        # Construir el PDF
        doc.build(story)
        
        # Obtener el contenido del buffer
        pdf_content = buffer.getvalue()
        buffer.close()
        
        # Crear respuesta con el PDF
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=plantilla_historia_clinica_completa.pdf"
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar plantilla: {str(e)}")
