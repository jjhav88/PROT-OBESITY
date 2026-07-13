"""
Intervalos de confianza (95 %) para tamaños del efecto — ANOVA y chi-cuadrado.
"""
from __future__ import annotations

import math
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

try:
    from scipy import stats as scipy_stats
    from scipy.stats import ncx2
except ImportError:  # pragma: no cover
    scipy_stats = None
    ncx2 = None

DEFAULT_CONF = 0.95
N_BOOT = 2000


def _safe_round(v: Any, nd: int = 4) -> Any:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    try:
        return round(float(v), nd)
    except (TypeError, ValueError):
        return v


def build_ci_dict(
    lo: Optional[float],
    hi: Optional[float],
    conf: float = DEFAULT_CONF,
) -> Optional[Dict[str, Any]]:
    if lo is None or hi is None:
        return None
    if math.isnan(lo) or math.isnan(hi) or math.isinf(lo) or math.isinf(hi):
        return None
    lo_f, hi_f = float(lo), float(hi)
    pct = int(round(conf * 100))
    return {
        "level": conf,
        "level_pct": pct,
        "lo": _safe_round(lo_f, 4),
        "hi": _safe_round(hi_f, 4),
        "display": f"[{_safe_round(lo_f, 4)}, {_safe_round(hi_f, 4)}]",
        "label": f"IC {pct}%",
    }


def _bootstrap_ci(
    effect_fn: Callable[[List[np.ndarray]], Optional[float]],
    groups: List[np.ndarray],
    conf: float = DEFAULT_CONF,
    n_boot: int = N_BOOT,
    clip: Optional[Tuple[float, float]] = None,
) -> Tuple[Optional[float], Optional[float]]:
    if not groups or scipy_stats is None:
        return None, None
    rng = np.random.default_rng(42)
    estimates: List[float] = []
    for _ in range(n_boot):
        samples = [
            rng.choice(g[np.isfinite(g)], size=int(np.sum(np.isfinite(g))), replace=True)
            for g in groups
            if np.sum(np.isfinite(g)) >= 2
        ]
        if len(samples) < len(groups):
            continue
        val = effect_fn(samples)
        if val is not None and not (math.isnan(val) or math.isinf(val)):
            if clip:
                val = max(clip[0], min(clip[1], float(val)))
            estimates.append(float(val))
    if len(estimates) < 80:
        return None, None
    alpha = (1 - conf) / 2
    return float(np.percentile(estimates, alpha * 100)), float(
        np.percentile(estimates, (1 - alpha) * 100)
    )


def _ss_oneway(groups: List[np.ndarray]) -> Tuple[float, float, float, int, int, float]:
    all_y = np.concatenate([g[np.isfinite(g)] for g in groups])
    n_total = len(all_y)
    k = len(groups)
    grand = float(np.mean(all_y))
    ss_between = sum(len(g) * (float(np.mean(g[np.isfinite(g)])) - grand) ** 2 for g in groups)
    ss_within = sum(float(np.sum((g[np.isfinite(g)] - np.mean(g[np.isfinite(g)])) ** 2)) for g in groups)
    ss_total = ss_between + ss_within
    df_between = k - 1
    df_within = n_total - k
    ms_within = ss_within / df_within if df_within > 0 else float("nan")
    return ss_between, ss_within, ss_total, df_between, df_within, ms_within


def eta_squared_from_groups(groups: List[np.ndarray]) -> Optional[float]:
    ss_between, _, ss_total, _, _, _ = _ss_oneway(groups)
    if ss_total <= 0:
        return None
    return float(ss_between / ss_total)


def omega_squared_from_groups(groups: List[np.ndarray]) -> Optional[float]:
    ss_between, _, ss_total, df_between, _, ms_within = _ss_oneway(groups)
    if math.isnan(ms_within) or (ss_total + ms_within) <= 0:
        return None
    return float((ss_between - df_between * ms_within) / (ss_total + ms_within))


def ci_eta_squared(groups: List[np.ndarray], conf: float = DEFAULT_CONF) -> Tuple[Optional[float], Optional[float]]:
    return _bootstrap_ci(eta_squared_from_groups, groups, conf=conf, clip=(0.0, 1.0))


def ci_omega_squared(groups: List[np.ndarray], conf: float = DEFAULT_CONF) -> Tuple[Optional[float], Optional[float]]:
    return _bootstrap_ci(omega_squared_from_groups, groups, conf=conf, clip=(-1.0, 1.0))


def ci_epsilon_squared(
    h_stat: float, k: int, n: int, conf: float = DEFAULT_CONF
) -> Tuple[Optional[float], Optional[float]]:
    if scipy_stats is None or ncx2 is None or n <= k or k < 2:
        return None, None
    df = k - 1
    try:
        lam = max(float(h_stat), 1e-9)
        chi_lo = float(ncx2.ppf((1 - conf) / 2, df, lam))
        chi_hi = float(ncx2.ppf(1 - (1 - conf) / 2, df, lam))
        eps_lo = (chi_lo - k + 1) / (n - k)
        eps_hi = (chi_hi - k + 1) / (n - k)
        return eps_lo, eps_hi
    except Exception:
        return None, None


def ci_cohens_d(
    g1: np.ndarray, g2: np.ndarray, conf: float = DEFAULT_CONF
) -> Tuple[Optional[float], Optional[float]]:
    g1 = g1[np.isfinite(g1)]
    g2 = g2[np.isfinite(g2)]
    n1, n2 = len(g1), len(g2)
    if n1 < 2 or n2 < 2 or scipy_stats is None:
        return None, None
    m1, m2 = float(np.mean(g1)), float(np.mean(g2))
    s1, s2 = float(np.var(g1, ddof=1)), float(np.var(g2, ddof=1))
    pooled = math.sqrt(((n1 - 1) * s1 + (n2 - 1) * s2) / (n1 + n2 - 2))
    if pooled <= 0:
        return None, None
    d = (m1 - m2) / pooled
    df = n1 + n2 - 2
    tcrit = float(scipy_stats.t.ppf(1 - (1 - conf) / 2, df))
    var_d = (n1 + n2) / (n1 * n2) + d**2 / (2 * (n1 + n2))
    se = math.sqrt(var_d)
    return d - tcrit * se, d + tcrit * se


def ci_rank_biserial(
    u_stat: float, n1: int, n2: int, conf: float = DEFAULT_CONF
) -> Tuple[Optional[float], Optional[float]]:
    if n1 <= 0 or n2 <= 0 or scipy_stats is None:
        return None, None
    r = 1 - (2 * u_stat) / (n1 * n2)
    r = max(min(r, 0.9999), -0.9999)
    z = 0.5 * math.log((1 + r) / (1 - r))
    se = math.sqrt((n1 + n2 + 1) / (n1 * n2))
    zcrit = float(scipy_stats.norm.ppf(1 - (1 - conf) / 2))
    z_lo, z_hi = z - zcrit * se, z + zcrit * se
    return math.tanh(z_lo / 2), math.tanh(z_hi / 2)


def ci_cramers_v(
    chi2: float, n: int, n_rows: int, n_cols: int, conf: float = DEFAULT_CONF
) -> Tuple[Optional[float], Optional[float]]:
    if scipy_stats is None or ncx2 is None or n <= 0:
        return None, None
    k = min(n_rows - 1, n_cols - 1)
    if k <= 0:
        return None, None
    df = (n_rows - 1) * (n_cols - 1)
    if df <= 0:
        return None, None
    try:
        lam = max(float(chi2), 1e-9)
        chi_lo = float(ncx2.ppf((1 - conf) / 2, df, lam))
        chi_hi = float(ncx2.ppf(1 - (1 - conf) / 2, df, lam))
        denom = n * k
        return math.sqrt(max(chi_lo, 0) / denom), math.sqrt(chi_hi / denom)
    except Exception:
        return None, None


def ci_odds_ratio_2x2(
    table: np.ndarray, conf: float = DEFAULT_CONF
) -> Tuple[Optional[float], Optional[float]]:
    if scipy_stats is None or table.shape != (2, 2):
        return None, None
    a, b = float(table[0, 0]), float(table[0, 1])
    c, d = float(table[1, 0]), float(table[1, 1])
    for v in (a, b, c, d):
        if v < 0:
            return None, None
    if min(a, b, c, d) == 0:
        a, b, c, d = a + 0.5, b + 0.5, c + 0.5, d + 0.5
    or_val = (a * d) / (b * c)
    if or_val <= 0:
        return None, None
    log_or = math.log(or_val)
    se = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
    zcrit = float(scipy_stats.norm.ppf(1 - (1 - conf) / 2))
    return math.exp(log_or - zcrit * se), math.exp(log_or + zcrit * se)
