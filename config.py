"""Configuración central de rutas de datos.

Permite que la aplicación funcione igual en local y en un hosting (Render)
con disco persistente. Todas las rutas de datos mutables (uploads, historias
clínicas, BANPE, metadatos, usuarios y auditoría) se resuelven a partir de
``DATA_DIR``.

- En local, ``DATA_DIR`` es por defecto la carpeta del código, por lo que el
  comportamiento previo no cambia.
- En Render se define la variable de entorno ``DATA_DIR`` apuntando al disco
  persistente (por ejemplo ``/var/data``). En el primer arranque se copian los
  datos incluidos en el repositorio hacia ese disco (sembrado), de modo que los
  investigadores vean los registros existentes y a partir de ahí persistan.
"""

import os
import shutil

# Carpeta del código y de los datos "semilla" incluidos en el repositorio.
BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))

# Carpeta de datos persistentes.
DATA_DIR = os.path.abspath(os.environ.get("DATA_DIR", BUNDLE_DIR))

os.makedirs(DATA_DIR, exist_ok=True)


def data_path(*parts):
    """Ruta dentro de la carpeta de datos persistentes."""
    return os.path.join(DATA_DIR, *parts)


def bundle_path(*parts):
    """Ruta dentro de la carpeta del código (datos semilla del repositorio)."""
    return os.path.join(BUNDLE_DIR, *parts)


# Elementos que se copian del repositorio al disco persistente en el primer
# arranque. Los archivos/carpetas solo se copian si aún no existen en el disco,
# de modo que nunca se sobrescribe información generada desde la web.
_SEED_FILES = ("file_metadata.json", "parent_report_notes.json")
_SEED_DIRS = ("uploads", "hc_data", "banpe_data")


def seed_data_dir():
    """Copia los datos incluidos en el repositorio al disco persistente.

    Es idempotente: solo agrega lo que falta y nunca sobrescribe datos ya
    presentes en ``DATA_DIR``.
    """
    if os.path.abspath(DATA_DIR) == os.path.abspath(BUNDLE_DIR):
        return  # En local los datos ya están en su sitio.

    for name in _SEED_FILES:
        src = bundle_path(name)
        dst = data_path(name)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy2(src, dst)

    for name in _SEED_DIRS:
        src = bundle_path(name)
        dst = data_path(name)
        if not os.path.isdir(src):
            continue
        os.makedirs(dst, exist_ok=True)
        for entry in os.listdir(src):
            s = os.path.join(src, entry)
            d = os.path.join(dst, entry)
            if os.path.isfile(s) and not os.path.exists(d):
                shutil.copy2(s, d)


seed_data_dir()
