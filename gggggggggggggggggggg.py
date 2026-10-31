"""
nobel_app.py — Nobel Prize Interactive Explorer (Streamlit)
===========================================================
تشغيل:  streamlit run nobel_app.py
"""

from __future__ import annotations

import io
import os

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

import nobel_core as nc

# ----------------------------------------------------------------------------
st.set_page_config(
    page_title="Nobel Explorer — تحليل تفاعلي لجوائز نوبل",
    page_icon="🏅",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
      .block-container {padding-top: 1.6rem; padding-bottom: 2rem;}
      [data-testid="stMetricValue"] {font-size: 1.5rem;}
      .hero{background:linear-gradient(100deg,#0f2027,#203a43,#2c5364);
            color:#fff;padding:20px 26px;border-radius:16px;margin-bottom:14px}
      .hero h1{margin:0;font-size:1.75rem;font-weight:700}
      .hero p{margin:.35rem 0 0;opacity:.88;font-size:.95rem}
      .card{background:#fafbfd;border:1px solid #e6eaf0;border-radius:14px;
            padding:14px 18px;margin-bottom:10px}
      .pill{display:inline-block;background:#eef3fa;border-radius:999px;
            padding:3px 12px;margin:2px 4px 2px 0;font-size:.85rem}
    </style>
    """,
    unsafe_allow_html=True,
)

CAT_COLORS = {
    "Physics": "#1f77b4",
    "Chemistry": "#ff7f0e",
    "Physiology or Medicine": "#2ca02c",
    "Literature": "#d62728",
    "Peace": "#9467bd",
    "Economic Sciences": "#8c564b",
}
GEN_COLORS = {"Male": "#2b5c8f", "Female": "#e0596b", "Organization": "#2ca02c", "Unknown": "#b9bfc7"}

DEFAULT_PATH = "nobel_prize_winners - nobel_prize_winners.csv"


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
@st.cache_data(show_spinner=False)
def _load(path: str | None, blob: bytes | None) -> pd.DataFrame:
    if blob is not None:
        return nc.clean(pd.read_csv(io.BytesIO(blob)))
    return nc.clean(pd.read_csv(path))


def chart(fig, height: int = 380, legend: bool = True):
    fig.update_layout(
        height=height,
        template="plotly_white",
        margin=dict(l=8, r=8, t=52, b=8),
        font=dict(size=12),
        showlegend=legend,
        legend=dict(orientation="h", yanchor="bottom", y=-0.28, x=0),
    )
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})


def note(md: str):
    st.info(md, icon="💡")


def money(x) -> str:
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "—"
    return f"${x/1e6:,.1f}M"


def pct(a, b) -> float:
    return round(100.0 * a / b, 1) if b else 0.0


COUNTRY_ALIASES = {
    "USA": "United States", "United Kingdom": "United Kingdom", "the Netherlands": "Netherlands",
    "Russian Empire": "Russia", "USSR": "Russia", "Prussia": "Germany", "Bavaria": "Germany",
    "West Germany": "Germany", "East Germany": "Germany", "Mecklenburg": "Germany",
    "Württemberg": "Germany", "Hesse-Kassel": "Germany", "Schleswig": "Germany",
    "East Friesland": "Germany", "German-occupied Poland": "Poland", "Free City of Danzig": "Poland",
    "Austria-Hungary": "Austria", "Ottoman Empire": "Turkey", "Czechoslovakia": "Czechia",
    "Czech Republic": "Czechia", "Yugoslavia": "Serbia", "Scotland": "United Kingdom",
    "Northern Ireland": "United Kingdom", "British India": "India", "British West Indies": "Saint Lucia",
    "British Mandate of Palestine": "Israel", "British Protectorate of Palestine": "Israel",
    "Southern Rhodesia": "Zimbabwe", "Northern Rhodesia": "Zambia", "Gold Coast": "Ghana",
    "Burma": "Myanmar", "Persia": "Iran", "Tuscany": "Italy", "Crete": "Greece",
    "Java, Dutch East Indies": "Indonesia", "Tibet": "China", "Faroe Islands (Denmark)": "Denmark",
    "Bosnia": "Bosnia and Herz.", "Bosnia and Herzegovina": "Bosnia and Herz.",
    "Democratic Republic of the Congo": "Dem. Rep. Congo", "East Timor": "Timor-Leste",
    "Guadeloupe Island": "Guadeloupe", "Korea": "South Korea", "Belgian Congo": "Dem. Rep. Congo",
}


# ----------------------------------------------------------------------------
# Sidebar — المصدر + الفلاتر
# ----------------------------------------------------------------------------
with st.sidebar:
    st.title("🏅 Nobel Explorer")
    st.caption("واجهة تفاعلية لفهم جوائز نوبل — من غير ما تكتب سطر كود.")

    st.markdown("**1) مصدر البيانات**")
    default_path = DEFAULT_PATH if os.path.exists(DEFAULT_PATH) else ""
    path = st.text_input("مسار ملف CSV", value=default_path, label_visibility="collapsed")
    up = st.file_uploader("أو ارفع ملف CSV", type=["csv"], label_visibility="collapsed")

    try:
        df = _load(None if up else path, up.getvalue() if up else None)
    except Exception as exc:  # noqa: BLE001
        st.error(f"مش قادر أقرأ الملف: {exc}")
        st.stop()

    st.markdown("---")
    st.markdown("**2) الفلاتر**")

    y0, y1 = int(df["awardYear"].min()), int(df["awardYear"].max())
    years = st.slider("مدى السنوات", y0, y1, (y0, y1), key="f_years")

    cats_present = [c for c in nc.CATEGORY_ORDER if c in set(df["category"])]
    cats_present += [c for c in df["category"].dropna().unique() if c not in cats_present]
    categories = st.multiselect("الفئات", cats_present, default=[], key="f_cats",
                                placeholder="كل الفئات")

    genders = st.multiselect("نوع الفائز", ["Male", "Female", "Organization", "Unknown"],
                             default=["Male", "Female", "Organization"], key="f_genders")

    conts = sorted(df["birth_continent"].dropna().unique().tolist())
    continents = st.multiselect("قارة الميلاد", conts, default=[], key="f_conts",
                                placeholder="كل القارات")

    countries = st.multiselect(
        "بلد الميلاد (حديث)",
        sorted(df["birth_country_now"].dropna().unique().tolist()),
        default=[], key="f_countries", placeholder="كل الدول",
    )

    kind = st.radio("نوع الحاصل", ["الكل", "أفراد", "منظمات"], horizontal=True, key="f_kind")

    query = st.text_input("🔎 بحث نصي (اسم / مؤسسة / كلمة في التكريم)", key="f_query")

    if st.button("↺ إعادة ضبط الفلاتر", use_container_width=True):
        for k in [k for k in list(st.session_state.keys()) if k.startswith("f_")]:
            del st.session_state[k]
        st.rerun()

    st.markdown("---")
    with st.expander("ℹ️ عن البيانات والأعمدة"):
        st.markdown(
            "- **المصدر:** Nobel Prize API (1901 → 2019).\n"
            "- `prizeAmountAdjusted`: قيمة الجائزة معدّلة للتضخم.\n"
            "- `portion`: نصيب الفائز من الجائزة (1/1، 1/2، 1/3).\n"
            "- `ind_or_org`: فرد أم منظمة.\n"
            "- **هجرة العقول**: مقارنة بلد الميلاد ببلد المؤسسة وقت الجائزة.\n"
            "- الأعمار محسوبة من `birth_date` باستخراج السنة (بيانات فيها `00-00` "
            "بتفشل مع `pd.to_datetime`)."
        )
        miss = (df.isna().mean() * 100).round(1).sort_values(ascending=False)
        st.dataframe(miss.rename("نسبة الفراغ %").to_frame().head(15),
                     use_container_width=True)

kinds = {"الكل": None, "أفراد": ["Individual"], "منظمات": ["Organization"]}[kind]

d = nc.apply_filters(
    df, years=years, categories=categories, genders=genders,
    continents=continents, countries=countries, kinds=kinds, query=query,
)

# ----------------------------------------------------------------------------
# Hero + حالة الفلاتر
# ----------------------------------------------------------------------------
st.markdown(
    f"""
    <div class="hero">
      <h1>🏅 Nobel Prize Interactive Explorer</h1>
      <p>استكشف {len(df):,} سجل فائز · من {y0} إلى {y1} · فلترة لحظية · شرح بلغة بسيطة لكل رسم</p>
    </div>
    """,
    unsafe_allow_html=True,
)

if d.empty:
    st.warning("مفيش نتائج مطابقة للفلاتر الحالية. وسّع المدى الزمني أو شيل بعض الفلاتر.")
    st.stop()

pills = [f"<span class='pill'>سجلات: <b>{len(d):,}</b></span>"]
if categories:
    pills.append(f"<span class='pill'>فئات: <b>{len(categories)}</b></span>")
if countries:
    pills.append(f"<span class='pill'>دول: <b>{len(countries)}</b></span>")
pills.append(f"<span class='pill'>السنوات: <b>{int(d['awardYear'].min())}–{int(d['awardYear'].max())}</b></span>")
st.markdown(" ".join(pills), unsafe_allow_html=True)
st.markdown("")

tabs = st.tabs([
    "🏠 نظرة عامة",
    "⏳ الزمن والاتجاهات",
    "🌍 الجغرافيا والهجرة",
    "👥 مين بيفوز؟",
    "👤 بطاقة فائز",
    "🎛️ ابنِ رسمك + الجدول",
    "🧠 اشرح لي / اسأل",
])

# ============================================================================
# 1) نظرة عامة
# ============================================================================
with tabs[0]:
    f = nc.key_facts(d)

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("فائزون", f"{f['rows']:,}")
    c2.metric("جوائز", f"{f['awards']:,}")
    c3.metric("فئات", f"{f['categories']}")
    c4.metric("دول", f"{f['countries']}")
    c5.metric("متوسط العمر", f"{f['mean_age']}" if f["mean_age"] == f["mean_age"] else "—")

    c6, c7, c8, c9, c10 = st.columns(5)
    c6.metric("نساء", f"{f['female']}", f"{f['pct_female']}% من الأفراد")
    c7.metric("منظمات", f"{f['orgs']}", f"{f['pct_org']}%")
    c8.metric("وسيط العمر", f"{f['median_age']}")
    c9.metric("مؤسسات", f"{f['n_inst']:,}")
    c10.metric("قيمة الجوائز (معدّلة)", money(f["prize_total"]))

    st.markdown("---")

    left, right = st.columns([2, 1])

    with left:
        s = nc.awards_by_year(d)
        fig = go.Figure()
        fig.add_bar(x=s.index, y=s.values, name="جوائز/سنة", marker_color="#8fb3d9")
        fig.add_scatter(x=s.index, y=s.cumsum().values, name="تراكمي",
                        mode="lines", line=dict(color="#c0392b", width=2.5),
                        yaxis="y2")
        fig.update_layout(
            title="عدد الجوائز سنويًا + التراكمي",
            yaxis=dict(title="جوائز"),
            yaxis2=dict(title="تراكمي", overlaying="y", side="right", showgrid=False),
            hovermode="x unified",
        )
        chart(fig, height=400)

    with right:
        g = d["gender_norm"].value_counts().reindex(nc.GENDER_ORDER).dropna()
        fig = px.pie(names=g.index, values=g.values, hole=0.55,
                     color=g.index, color_discrete_map=GEN_COLORS,
                     title="توزيع نوع الفائز")
        fig.update_traces(textinfo="percent+label")
        chart(fig, height=400)

    left, right = st.columns(2)
    with left:
        cc = nc.top_countries(d, 12)
        tmp = cc.sort_values().rename_axis("country").reset_index(name="n")
        fig = px.bar(tmp, x="n", y="country", orientation="h", text="n",
                     title="أعلى 12 بلد ميلاد (حديث)",
                     color="n", color_continuous_scale="Blues")
        fig.update_layout(coloraxis_showscale=False, yaxis_title="", xaxis_title="فائزون")
        chart(fig, height=420)
    with right:
        cat = d["category"].value_counts().reindex(nc.CATEGORY_ORDER).dropna()
        fig = px.bar(x=cat.index, y=cat.values, text=cat.values,
                     color=cat.index, color_discrete_map=CAT_COLORS,
                     title="عدد الفائزين لكل فئة")
        fig.update_layout(showlegend=False, xaxis_title="", yaxis_title="فائزون")
        chart(fig, height=420)

    st.markdown("### 🧾 خلاصة سريعة (تتحدّث مع الفلاتر)")
    for line in nc.narrative(d):
        st.markdown(f"- {line}")

# ============================================================================
# 2) الزمن والاتجاهات
# ============================================================================
with tabs[1]:
    st.subheader("كيف تغيّرت جوائز نوبل عبر الزمن؟")

    dec = nc.awards_by_decade(d)
    t = dec.rename_axis("decade").reset_index(name="awards")
    t["decade"] = t["decade"].astype(int).astype(str) + "s"
    fig = px.bar(t, x="decade", y="awards", text="awards", title="جوائز لكل عشرية",
                 color="awards", color_continuous_scale="Teal")
    fig.update_layout(coloraxis_showscale=False, xaxis_title="", yaxis_title="جوائز")
    chart(fig, height=360)

    if len(dec) >= 2:
        diff = dec.diff()
        peak = int(diff.idxmax())
        note(f"أكبر قفزة في عدد الجوائز كانت في العشرية **{peak}s** "
             f"(**+{int(diff.max())}** جائزة عن العشرية السابقة). "
             f"أكتر عشرية ازدحامًا: **{int(dec.idxmax())}s** بـ **{int(dec.max())}** جائزة.")

    st.markdown("---")
    left, right = st.columns(2)

    with left:
        mix = nc.collab_by_decade(d)
        mix_m = mix.melt(id_vars="decade", var_name="type", value_name="pct")
        mix_m["decade"] = mix_m["decade"].astype(int).astype(str) + "s"
        fig = px.bar(mix_m, x="decade", y="pct", color="type", barmode="stack",
                     title="فردي مقابل جماعي (% لكل عشرية)",
                     color_discrete_map={"Single": "#9ecae1", "Collaborative": "#08519c"})
        fig.update_layout(yaxis_title="%", xaxis_title="", legend_title="")
        chart(fig, height=380)

    with right:
        sh = nc.share_mix_by_decade(d)
        sh_m = sh.melt(id_vars="decade", var_name="share", value_name="pct")
        sh_m["decade"] = sh_m["decade"].astype(int).astype(str) + "s"
        fig = px.bar(sh_m, x="decade", y="pct", color="share", barmode="stack",
                     title="تفتيت الجائزة: 1/1 مقابل 1/2 مقابل 1/3",
                     color_discrete_sequence=px.colors.sequential.Spectral_r)
        fig.update_layout(yaxis_title="%", xaxis_title="", legend_title="")
        chart(fig, height=380)

    if len(mix):
        last = mix.iloc[-1]
        note(f"في عشرية **{int(last['decade'])}s**: **{last['Collaborative']}%** من الفائزين "
             f"كانوا في جائزة مشتركة — وده يوضّح إن الاكتشافات الحديثة بقت عمل جماعي.")

    st.markdown("---")
    left, right = st.columns(2)

    with left:
        at = nc.age_trend_by_decade(d).dropna(subset=["age"])
        if not at.empty:
            at["decade"] = at["decade"].astype(int)
            fig = px.line(at, x="decade", y="age", color="category", markers=True,
                          title="متوسط العمر وقت الجائزة عبر العقود",
                          color_discrete_map=CAT_COLORS)
            fig.update_layout(xaxis_title="العشرية", yaxis_title="متوسط العمر",
                              legend_title="", template="plotly_white")
            chart(fig, height=420)
        else:
            st.info("مفيش أعمار كفاية في الاختيار الحالي.")

    with right:
        a = d.dropna(subset=["age"])
        fig = px.histogram(a, x="age", nbins=28, marginal="box",
                           title="توزيع أعمار الفائزين",
                           color_discrete_sequence=["#2b8cbe"])
        fig.update_layout(xaxis_title="العمر وقت الجائزة", yaxis_title="عدد")
        chart(fig, height=420)
        if len(a):
            note(f"الوسيط **{a['age'].median():.0f}** سنة · المتوسط **{a['age'].mean():.1f}** · "
                 f"المدى {a['age'].min():.0f}–{a['age'].max():.0f}.")

# ============================================================================
# 3) الجغرافيا والهجرة
# ============================================================================
with tabs[2]:
    st.subheader("مين بيفوز… ومنين؟ ومن يهاجر لمن ينجح؟")

    left, right = st.columns([1, 1])
    with left:
        cc = nc.top_countries(d, 15)
        tmp = cc.sort_values().rename_axis("country").reset_index(name="n")
        fig = px.bar(tmp, x="n", y="country", orientation="h", text="n",
                     title="أعلى 15 بلد ميلاد",
                     color="n", color_continuous_scale="Purples")
        fig.update_layout(coloraxis_showscale=False, yaxis_title="", xaxis_title="فائزون")
        chart(fig, height=460)

    with right:
        m = d.copy()
        m["iso"] = m["birth_country_now"].map(COUNTRY_ALIASES).fillna(m["birth_country_now"])
        gm = m["iso"].value_counts().rename_axis("country").reset_index(name="n")
        fig = px.choropleth(gm, locations="country", locationmode="country names",
                            color="n", hover_name="country",
                            color_continuous_scale="YlGnBu",
                            title="خريطة بلد الميلاد (تقريبية)")
        fig.update_geos(showframe=False, showcoastlines=False, projection_type="natural earth")
        fig.update_layout(coloraxis_colorbar_title="فائزون")
        chart(fig, height=460)

    note("الخريطة **تقريبية**: بعض الأسماء تاريخية (Prussian Empire, USSR, Persia…) تم "
         "تحويلها لأقرب دولة حديثة. الرسم البياني على الشمال هو المرجع الأدق.")

    st.markdown("---")
    left, right = st.columns(2)

    with left:
        cx = nc.country_x_category(d, 10)
        if not cx.empty:
            fig = px.imshow(cx, text_auto=True, aspect="auto", color_continuous_scale="Blues",
                            title="بلد الميلاد × الفئة (أعلى 10 دول)")
            fig.update_layout(xaxis_title="", yaxis_title="", coloraxis_showscale=False)
            chart(fig, height=460, legend=False)

    with right:
        cd = nc.country_x_decade(d, 10)
        if not cd.empty:
            fig = px.imshow(cd, text_auto=True, aspect="auto", color_continuous_scale="YlOrBr",
                            title="بلد الميلاد × العشرية (أعلى 10 دول)")
            fig.update_layout(xaxis_title="العشرية", yaxis_title="", coloraxis_showscale=False)
            chart(fig, height=460, legend=False)

    if not cx.empty:
        us = cx.loc[cx.sum(axis=1).idxmax()]
        top_field = us.idxmax()
        note(f"أكبر دولة (**{cx.sum(axis=1).idxmax()}**) تركّزت أكتر في فئة **{top_field}**، "
             f"بينما الفئات الأدبية/السلام بتتوزّع أكتر على دول مختلفة.")

    st.markdown("---")
    st.markdown("### ✈️ هجرة العقول: بلد الميلاد مقابل بلد المؤسسة")
    bva = nc.birth_vs_affiliation(d, 12)
    if not bva.empty:
        bva_m = bva.reset_index().rename(columns={"index": "country"})
        bva_m = bva_m.melt(id_vars=["country", "net"],
                           value_vars=["birth", "affiliation"],
                           var_name="kind", value_name="n")
        bva_m["kind"] = bva_m["kind"].map({"birth": "مولود هناك", "affiliation": "بيشتغل هناك"})
        fig = px.bar(bva_m, x="n", y="country", color="kind", barmode="group",
                     orientation="h", title="بلد الميلاد × بلد المؤسسة (أعلى 12)",
                     color_discrete_map={"مولود هناك": "#9ecae1", "بيشتغل هناك": "#08519c"})
        fig.update_layout(xaxis_title="فائزون", yaxis_title="", legend_title="")
        chart(fig, height=460)

        gain = bva["net"].sort_values(ascending=False).head(3)
        loss = bva["net"].sort_values().head(3)
        txt = " · ".join(f"**{k}** ({'+' if v>0 else ''}{int(v)})" for k, v in gain.items())
        txt2 = " · ".join(f"**{k}** ({int(v)})" for k, v in loss.items())
        note(f"أكبر **مكسِب** للأدمغة: {txt}.  \nأكبر **فقد**: {txt2}.")
    else:
        st.info("مفيش بيانات مؤسسات كفاية لتحليل الهجرة.")

    left, right = st.columns([1, 1])
    with left:
        mg = nc.migration_by_decade(d)
        if len(mg):
            mg["decade"] = mg["decade"].astype(int)
            fig = px.line(mg, x="decade", y="rate", markers=True,
                          title="نسبة «هجرة العقول» لكل عشرية")
            fig.update_layout(xaxis_title="العشرية", yaxis_title="% مهاجرين")
            chart(fig, height=380)
        else:
            st.info("مفيش بيانات هجرة كفاية.")

    with right:
        tab = nc.birth_vs_affiliation(d, 15).reset_index()
        tab.columns = ["الدولة", "مولود هناك", "بيشتغل هناك", "الصافي"]
        st.dataframe(tab, use_container_width=True, height=380, hide_index=True)

# ============================================================================
# 4) مين بيفوز؟
# ============================================================================
with tabs[3]:
    st.subheader("نوع الفائز، الفئة، وشكل الجائزة")

    left, right = st.columns(2)
    with left:
        ct = nc.category_x_winner(d).reset_index()
        ct_m = ct.melt(id_vars="category", var_name="نوع", value_name="عدد")
        fig = px.bar(ct_m, x="category", y="عدد", color="نوع", barmode="stack",
                     title="الفئة × نوع الفائز",
                     color_discrete_map=GEN_COLORS)
        fig.update_layout(xaxis_title="", legend_title="")
        chart(fig, height=420)

        org_total = int((d["gender_norm"] == "Organization").sum())
        peace_org = int(((d["gender_norm"] == "Organization") & (d["category"] == "Peace")).sum())
        if org_total:
            note(f"**{pct(peace_org, org_total)}%** من المنظمات الفائزة كانت في فئة **السلام** — "
                 f"يعني الجوائز المؤسسية تقريبًا محصورة هناك ({peace_org} من {org_total}).")

    with right:
        gd = nc.gender_by_decade(d)
        gd_m = gd.melt(id_vars="decade", value_name="n", var_name="نوع")
        gd_m["decade"] = gd_m["decade"].astype(int)
        fig = px.bar(gd_m, x="decade", y="n", color="نوع", barmode="group",
                     title="عدد الفائزين لكل نوع عبر العقود",
                     color_discrete_map=GEN_COLORS)
        fig.update_layout(xaxis_title="العشرية", yaxis_title="عدد", legend_title="")
        chart(fig, height=420)

        fs = nc.female_share_by_decade(d)
        if len(fs) > 1:
            first = fs.iloc[0]
            last = fs.iloc[-1]
            note(f"نسبة النساء بدأت **{first['female_pct']}%** في {int(first['decade'])}s "
                 f"ووصلت **{last['female_pct']}%** في {int(last['decade'])}s.")

    st.markdown("---")
    left, right = st.columns([3, 2])

    with left:
        a = d.dropna(subset=["age"])
        fig = px.box(a, x="category", y="age", color="category", points="outliers",
                     title="توزيع الأعمار لكل فئة", color_discrete_map=CAT_COLORS)
        fig.update_layout(xaxis_title="", yaxis_title="العمر", showlegend=False)
        chart(fig, height=420)

    with right:
        t = nc.age_by_category(d)
        t.columns = ["الفئة", "عدد", "متوسط", "وسيط", "أصغر", "أكبر"]
        st.dataframe(t, use_container_width=True, hide_index=True, height=300)
        if len(t):
            y = t.iloc[0]
            o = t.sort_values("متوسط").iloc[-1]
            note(f"الأصغر سنًّا: **{y['الفئة']}** (متوسط {y['متوسط']}). "
                 f"الأكبر: **{o['الفئة']}** (متوسط {o['متوسط']}).")

    st.markdown("---")
    left, right = st.columns([2, 1])
    with left:
        ti = nc.top_institutions(d, 15).sort_values().rename_axis("inst").reset_index(name="n")
        fig = px.bar(ti, x="n", y="inst", orientation="h", text="n",
                     title="أعلى 15 مؤسسة استقبلت فائزين (وقت الجائزة)",
                     color="n", color_continuous_scale="Reds")
        fig.update_layout(coloraxis_showscale=False, yaxis_title="", xaxis_title="فائزون")
        chart(fig, height=460)

    with right:
        rw = nc.repeat_winners(d)
        st.markdown("#### 🔁 فازوا أكتر من مرة")
        if rw.empty:
            st.caption("مفيش فائزين متكررين في الاختيار الحالي.")
        else:
            rw2 = rw.head(12).copy()
            rw2.columns = ["الاسم", "مرات", "أول مرة", "آخر مرة"]
            st.dataframe(rw2, use_container_width=True, hide_index=True, height=330)
            note("تكرار الفوز نادر جدًا — بيحصل غالبًا في مجالات مختلفة "
                 "(زي ماريا كوري: فيزياء + كيمياء).")

# ============================================================================
# 5) بطاقة فائز
# ============================================================================
with tabs[4]:
    st.subheader("ابحث عن فائز وشوف ملفّه كامل")

    c1, c2 = st.columns([2, 1])
    with c1:
        pool = d if len(d) else df
        names = sorted(pool["display_name"].dropna().unique().tolist())
        pick = st.selectbox("اختر فائز", names, index=0)
    with c2:
        pick2 = st.selectbox("قارن مع (اختياري)", ["—"] + names, index=0)


def _profile_card(row: pd.Series, title_prefix: str = ""):
    badges = [
        f"<span class='pill'>{row['category']}</span>",
        f"<span class='pill'>{int(row['awardYear'])}</span>",
        f"<span class='pill'>{row['gender_norm']}</span>",
    ]
    if pd.notna(row.get("age")):
        badges.append(f"<span class='pill'>العمر: {int(row['age'])}</span>")
    if pd.notna(row.get("birth_country_now")):
        badges.append(f"<span class='pill'>📍 {row['birth_country_now']}</span>")

    st.markdown(
        f"<div class='card'><h3 style='margin:0 0 6px'>{title_prefix}{row['display_name']}</h3>"
        f"{' '.join(badges)}</div>",
        unsafe_allow_html=True,
    )

    a, b = st.columns(2)
    with a:
        st.markdown(f"**الاسم الكامل:** {row.get('fullName') or '—'}")
        st.markdown(f"**التصنيف:** {row.get('ind_or_org') or '—'}")
        st.markdown(f"**مكان الميلاد:** {row.get('birth_locationString') or '—'}")
        st.markdown(f"**تاريخ الميلاد:** {row.get('birth_date') or '—'}")
        dth = row.get("death_date")
        st.markdown(f"**الوفاة:** {dth if isinstance(dth, str) and dth else '—'}")
    with b:
        st.markdown(f"**نصيب الجائزة:** {row.get('portion') or '—'}")
        st.markdown(f"**قيمة الجائزة (اسمي):** {money(row.get('prizeAmount'))}")
        st.markdown(f"**قيمة معدّلة للتضخم:** {money(row.get('prizeAmountAdjusted'))}")
        st.markdown(f"**حالة الجائزة:** {row.get('prizeStatus') or '—'}")
        st.markdown(f"**عدد المشاركين في الجائزة:** {int(row['n_winners'])}")

    st.markdown(f"**المؤسسة وقت الجائزة:** {row.get('institution') or '—'}")
    if isinstance(row.get("motivation"), str):
        st.markdown(f"**التكريم:** _{row['motivation']}_")

    links = []
    if isinstance(row.get("award_link"), str) and row["award_link"].startswith("http"):
        links.append(f"[🔗 صفحة الجائزة على NobelPrize.org]({row['award_link']})")
    if isinstance(row.get("laureate_link"), str) and row["laureate_link"].startswith("http"):
        links.append(f"[👤 صفحة الفائز]({row['laureate_link']})")
    if links:
        st.markdown(" · ".join(links))


with tabs[4]:
    if len(names):
        row = d[d["display_name"] == pick].iloc[0] if (d["display_name"] == pick).any() \
            else df[df["display_name"] == pick].iloc[0]

        if pick2 == "—":
            _profile_card(row)
        else:
            c1, c2 = st.columns(2)
            row2 = df[df["display_name"] == pick2].iloc[0]
            with c1:
                _profile_card(row, "🅰️ ")
            with c2:
                _profile_card(row2, "🅱️ ")

            st.markdown("---")
            st.markdown("#### مقارنة سريعة")
            cmp = pd.DataFrame({
                "المعيار": ["السنة", "الفئة", "العمر", "البلد", "قيمة الجائزة (معدّلة)", "عدد المشاركين"],
                pick: [int(row["awardYear"]), row["category"], row.get("age"),
                       row.get("birth_country_now"), money(row.get("prizeAmountAdjusted")),
                       int(row["n_winners"])],
                pick2: [int(row2["awardYear"]), row2["category"], row2.get("age"),
                        row2.get("birth_country_now"), money(row2.get("prizeAmountAdjusted")),
                        int(row2["n_winners"])],
            })
            st.dataframe(cmp, use_container_width=True, hide_index=True)

        st.markdown("---")
        st.markdown("#### 🧑‍🤝‍🧑 شاركوا نفس الجائزة")
        same = df[(df["awardYear"] == row["awardYear"]) & (df["category"] == row["category"])]
        cols = ["display_name", "gender_norm", "birth_country_now", "portion", "institution"]
        st.dataframe(same[cols].rename(columns={
            "display_name": "الاسم", "gender_norm": "النوع",
            "birth_country_now": "البلد", "portion": "النصيب", "institution": "المؤسسة",
        }), use_container_width=True, hide_index=True)

        others = df[(df["display_name"] == row["display_name"])].sort_values("awardYear")
        if len(others) > 1:
            st.markdown("#### 🔁 كل جوائزه")
            st.dataframe(others[["awardYear", "category", "motivation"]].rename(columns={
                "awardYear": "السنة", "category": "الفئة", "motivation": "التكريم",
            }), use_container_width=True, hide_index=True)

# ============================================================================
# 6) ابنِ رسمك + الجدول
# ============================================================================
with tabs[5]:
    st.subheader("🎛️ ابنِ الرسم اللي إنت عايزه")
    st.caption("اختار المحور والمقياس ونوع الرسم — وبعدها نزّل الجدول أو الصورة.")

    X_OPTS = {
        "السنة": "awardYear",
        "العشرية": "decade",
        "الفئة": "category",
        "نوع الفائز": "gender_norm",
        "قارة الميلاد": "birth_continent",
        "بلد الميلاد": "birth_country_now",
        "بلد المؤسسة": "aff_country",
        "المؤسسة": "institution",
    }
    Y_OPTS = {
        "عدد الفائزين": ("id", "count"),
        "متوسط العمر": ("age", "mean"),
        "وسيط العمر": ("age", "median"),
        "إجمالي قيمة الجوائز (معدّلة)": ("prizeAmountAdjusted", "sum"),
        "متوسط قيمة الجائزة": ("prizeAmountAdjusted", "mean"),
    }

    c1, c2, c3, c4 = st.columns(4)
    x_label = c1.selectbox("المحور X", list(X_OPTS), index=2)
    y_label = c2.selectbox("المقياس Y", list(Y_OPTS), index=0)
    ctype = c3.selectbox("نوع الرسم", ["أعمدة أفقية", "أعمدة رأسية", "خط", "مساحة", "دونات"])
    topn = c4.slider("أعلى N", 3, 40, 12)

    xcol = X_OPTS[x_label]
    ycol, yfunc = Y_OPTS[y_label]

    agg = d.dropna(subset=[xcol]).groupby(xcol).agg(value=(ycol, yfunc)).reset_index()
    agg = agg.sort_values("value", ascending=False).head(topn)

    if ctype in ("أعمدة أفقية",):
        tmp = agg.sort_values("value")
        fig = px.bar(tmp, x="value", y=xcol, orientation="h", text="value",
                     color="value", color_continuous_scale="Teal",
                     title=f"{y_label} حسب {x_label}")
        fig.update_layout(coloraxis_showscale=False, yaxis_title="", xaxis_title=y_label)
        chart(fig, height=480)
    elif ctype in ("أعمدة رأسية",):
        fig = px.bar(agg, x=xcol, y="value", text="value",
                     color="value", color_continuous_scale="Sunset",
                     title=f"{y_label} حسب {x_label}")
        fig.update_layout(coloraxis_showscale=False, xaxis_title="", yaxis_title=y_label)
        chart(fig, height=460)
    elif ctype == "خط":
        tmp = agg.sort_values(xcol)
        fig = px.line(tmp, x=xcol, y="value", markers=True,
                      title=f"{y_label} حسب {x_label}")
        fig.update_layout(xaxis_title=x_label, yaxis_title=y_label)
        chart(fig, height=460)
    elif ctype == "مساحة":
        tmp = agg.sort_values(xcol)
        fig = px.area(tmp, x=xcol, y="value", title=f"{y_label} حسب {x_label}")
        fig.update_layout(xaxis_title=x_label, yaxis_title=y_label)
        chart(fig, height=460)
    else:
        fig = px.pie(agg, names=xcol, values="value", hole=0.5,
                     title=f"{y_label} حسب {x_label}")
        fig.update_traces(textinfo="percent+label")
        chart(fig, height=480, legend=False)

    st.markdown("---")
    st.subheader("📋 الجدول التفصيلي (مفلتر)")
    st.caption(f"{len(d):,} صف · اختار الأعمدة اللي تهمّك")

    all_cols = [
        "display_name", "awardYear", "category", "gender_norm", "age",
        "birth_country_now", "birth_city", "aff_country", "institution",
        "portion", "n_winners", "prizeAmount", "prizeAmountAdjusted",
        "prizeStatus", "ind_or_org", "motivation",
    ]
    all_cols = [c for c in all_cols if c in d.columns]
    sel = st.multiselect("الأعمدة", all_cols, default=all_cols[:9])

    view = d[sel].rename(columns={
        "display_name": "الاسم", "awardYear": "السنة", "category": "الفئة",
        "gender_norm": "النوع", "age": "العمر", "birth_country_now": "بلد الميلاد",
        "birth_city": "مدينة الميلاد", "aff_country": "بلد المؤسسة",
        "institution": "المؤسسة", "portion": "النصيب", "n_winners": "عدد المشاركين",
        "prizeAmount": "قيمة اسمية", "prizeAmountAdjusted": "قيمة معدّلة",
        "prizeStatus": "الحالة", "ind_or_org": "فرد/منظمة", "motivation": "التكريم",
    })

    st.dataframe(view, use_container_width=True, height=430, hide_index=True)
    st.download_button(
        "⬇️ نزّل CSV (بعد الفلاتر)",
        data=d.to_csv(index=False).encode("utf-8-sig"),
        file_name="nobel_filtered.csv",
        mime="text/csv",
        use_container_width=True,
    )

# ============================================================================
# 7) اشرح لي / اسأل
# ============================================================================
with tabs[6]:
    st.subheader("🧠 مش خبير؟ مش مشكلة — اسأل بالعربي")

    q = st.selectbox("اختار سؤال", nc.QUESTIONS)
    ans, table = nc.answer_question(d, q)
    st.markdown(f"### ❓ {q}")
    st.success(ans, icon="✅")
    if table is not None:
        st.dataframe(table, use_container_width=True, hide_index=True)

    st.markdown("---")
    st.subheader("🧾 الخلاصة بلغة بسيطة")
    for line in nc.narrative(d):
        st.markdown(f"- {line}")

    st.markdown("---")
    st.subheader("📖 قاموس سريع للمصطلحات")
    with st.expander("إيه معنى «portion» و«1/3»؟"):
        st.markdown(
            "نصيب الفائز من قيمة الجائزة. **1/1** = خد الجائزة لوحده، "
            "**1/2** = نصّها (هو وشخص تاني)، **1/3** = تُلت (٣ أشخاص). "
            "النظام الأساسي لنوبل بيمنع أكتر من ٣ فائزين لنفس الجائزة."
        )
    with st.expander("إيه «prizeAmountAdjusted»؟"):
        st.markdown(
            "قيمة الجائزة **معدّلة للتضخم** (بالأسعار الحالية). "
            "مثلًا 150 ألف كرونة سنة 1901 تعادل ملايين النهاردة — "
            "فالمقارنة العادلة بين السنوات بتتم بالأرقام المعدّلة."
        )
    with st.expander("إيه «هجرة العقول / Brain Drain»؟"):
        st.markdown(
            "بنقارن **بلد الميلاد** بـ **بلد المؤسسة** اللي كان بيشتغل فيها وقت الجائزة. "
            "لو مختلفين → نعتبره مهاجر. ده بيوضّح إن النجاح العلمي بيتجمّع في أماكن "
            "فيها تمويل ومعامل ومؤسسات قوية."
        )
    with st.expander("ليه فيه فئة اسمها «Organization»؟"):
        st.markdown(
            "لأن فيه فائزين مش أشخاص — زي الصليب الأحمر، اليونيسيف، الاتحاد الأوروبي. "
            "دول تقريبًا كلهم في فئة **السلام**. في الداتا الأصلية جنسهم كان فاضي "
            "(NaN) فملّيناه بـ Organization وده اللي بيخلي التحليل صحيح."
        )
    with st.expander("إزاي أقرأ الرسم بسرعة؟"):
        st.markdown(
            "1. بص على **العنوان** — بيقول المحورين إيه.\n"
            "2. مرّر بالماوس فوق أي عمود/نقطة → تفاصيل دقيقة.\n"
            "3. استخدم **الفلاتر على الشمال** عشان تعزل فئة أو فترة.\n"
            "4. الجملة اللي تحت كل رسم (بالأزرق) بتشرح **الاستنتاج** مش الأرقام بس."
        )

    with st.expander("⚙️ جودة البيانات (قبل التنظيف)"):
        raw_missing = df.isna().mean().mul(100).round(1).sort_values(ascending=False)
        st.dataframe(raw_missing.rename("نسبة الفراغ %").to_frame().head(20),
                     use_container_width=True)
        st.caption(
            f"إجمالي الصفوف: {len(df):,} · الأعمدة: {df.shape[1]} · "
            f"الأعمار المتاحة: {int(df['age'].notna().sum()):,} · "
            f"المؤسسات المتاحة: {int(df['institution'].notna().sum()):,}"
        )

st.markdown("---")
st.caption(
    "Nobel Prize Interactive Explorer · Streamlit + Plotly + pandas · "
    "البيانات: Nobel Prize API (1901–2019)"
)