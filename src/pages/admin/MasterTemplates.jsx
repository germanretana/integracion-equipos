import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../services/auth";
import Markdown from "../../components/Markdown";
import "../../styles/admin.css";

/**
 * BLOQUE 4B-1
 * Guardamos un "instrumento" fiel a la tabla:
 * - flat list (no UI participante aún)
 * - con groupId / dependsOn para lógica condicional y preguntas compuestas
 *
 * schemaVersion nos permite evolucionar luego (matrices, layouts, etc.)
 */
const SCHEMA_VERSION = 1;

function Tab({ active, children, onClick }) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
      style={{
        opacity: active ? 1 : 0.75,
        borderColor: active
          ? "rgba(255,255,255,0.22)"
          : "rgba(255,255,255,0.12)",
        background: active
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.06)",
        fontWeight: active ? 900 : 800,
      }}
    >
      {children}
    </button>
  );
}

function normOrder(order) {
  const s = String(order || "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(x) {
  return String(x ?? "").trim();
}

function Q({
  id,
  order,
  item,
  type,
  minEntries,
  maxEntries,
  explanation,
  condition,
  groupId,
  dependsOn,
  meta,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    order: normOrder(order),
    item: safeStr(item),
    type: safeStr(type),
    minEntries:
      minEntries === "" || minEntries == null ? null : Number(minEntries),
    maxEntries:
      maxEntries === "" || maxEntries == null ? null : Number(maxEntries),
    explanation: safeStr(explanation) || null,
    condition: safeStr(condition) || null,
    groupId: safeStr(groupId) || null,
    dependsOn: dependsOn || null,
    meta: meta || null,
  };
}

/** ==============
 * OFFICIAL SETS
 * ============== */

const OFFICIAL_C1 = [
  Q({
    id: "c1-1",
    order: 1,
    item: "Mi nivel de satisfacción general por pertenecer a este equipo gerencial es:",
    type: "rating_masc_5",
    minEntries: 1,
    maxEntries: 1,
    meta: {
      labels: ["Insatisfactorio", "Regular", "Bueno", "Muy Bueno", "Excelente"],
      report: "frequency",
    },
  }),

  Q({
    id: "c1-2",
    order: 2,
    item: "Lo que más me motiva para pertenecer a este equipo es:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 2,
  }),

  Q({
    id: "c1-3",
    order: 3,
    item: "Podemos tener aspectos y situaciones que mejorar, pero lo que hacemos realmente bien y debemos seguir haciendo igual en nuestro equipo es:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 3,
  }),

  // 4a + 4b (grupo)
  Q({
    id: "c1-4a",
    order: 4.1,
    groupId: "c1-4",
    item: "Un excelente equipo de alta dirección se caracteriza por la calidad de sus discusiones sobre asuntos estratégicos. En nuestro caso la calidad del análisis sobre el desarrollo futuro de la organización es:",
    type: "rating_fem_5",
    minEntries: 1,
    maxEntries: 1,
    meta: {
      labels: ["Insatisfactoria", "Regular", "Buena", "Muy Buena", "Excelente"],
      report: "frequency",
    },
  }),
  Q({
    id: "c1-4b",
    order: 4.2,
    groupId: "c1-4",
    item: "¿Por qué?",
    type: "text_area",
    minEntries: 1,
    maxEntries: 1,
    meta: { report: "list_reasons" },
  }),

  // 5a + condicionales 5b/5c
  Q({
    id: "c1-5a",
    order: 5.1,
    item: "¿Tenemos claros los objetivos de la organización, el plan de desarrollo estratégico y nuestros proyectos para los próximos años?",
    type: "binary_yes_no",
    minEntries: 1,
    maxEntries: 1,
    meta: { report: "frequency" },
  }),
  Q({
    id: "c1-5b",
    order: 5.2,
    item: "¿Nos sentimos comprometidos con ese plan?",
    type: "binary_yes_no",
    minEntries: 1,
    maxEntries: 1,
    condition: 'Appears only if 5a is "Sí"',
    dependsOn: { id: "c1-5a", equals: "Sí" },
    meta: { report: "frequency" },
  }),
  Q({
    id: "c1-5c",
    order: 5.3,
    item: "El personal de la organización conoce estos objetivos y nosotros los líderes promovemos su alcance y les ofrecemos información sobre los avances.",
    type: "binary_yes_no",
    minEntries: 1,
    maxEntries: 1,
    condition: 'Appears only if 5a is "Sí"',
    dependsOn: { id: "c1-5a", equals: "Sí" },
    meta: { report: "frequency" },
  }),

  // 6a + 6b (grupo: razones por Sí/No)
  Q({
    id: "c1-6a",
    order: 6.1,
    groupId: "c1-6",
    item: "¿Somos un verdadero equipo?",
    type: "binary_yes_no",
    minEntries: 1,
    maxEntries: 1,
    meta: { report: "frequency" },
  }),
  Q({
    id: "c1-6b",
    order: 6.2,
    groupId: "c1-6",
    item: "¿Por qué?",
    type: "text_area",
    minEntries: 1,
    maxEntries: 1,
    meta: { report: "reasons_by_binary", groupByQuestionId: "c1-6a" },
  }),

  Q({
    id: "c1-7",
    order: 7,
    item: "La percepción que, en general, otras personas que laboran en la organización tienen sobre nuestro desempeño como equipo líder es más o menos así:",
    type: "text_area",
    minEntries: 0,
    maxEntries: 1,
  }),

  // Header 8 + valores 8a..8y con sugerencias
  Q({
    id: "c1-8",
    order: 8,
    item: "Utilice la siguiente escala para evaluar el desempeño del Equipo Gerencial:",
    type: "value_0_4_grid",
    meta: {
      columns: ["label", "value", "suggestion"],
    },
    items: [
      {
        id: "c1-8a",
        text: "Participación, fluidez y compromiso en formulación y ejecución de la estrategia:",
      },
      { id: "c1-8b", text: "Periodicidad de reuniones como equipo líder." },
      {
        id: "c1-8c",
        text: "Conducción, involucramiento y eficiencia en cada reunión:",
      },
      {
        id: "c1-8e",
        text: "Calidad de información disponible entre nosotros para análisis y toma de decisiones:",
      },
      {
        id: "c1-8f",
        text: "Seguimiento a cumplimiento de nuestros acuerdos como Equipo Gerencial.",
      },
      {
        id: "c1-8g",
        text: "Juego limpio en nuestra comunicación formal y no formal (no chismes).",
      },
      {
        id: "c1-8h",
        text: "Objetividad y neutralidad de decisiones (sin intereses o agendas personales de por medio):",
      },
      {
        id: "c1-8i",
        text: "Ambiente de equipo, cooperación, solidaridad, confidencialidad y respeto entre nosotros:",
      },
      {
        id: "c1-8j",
        text: "Relaciones de miembros de equipo gerencial con siguiente nivel de gestión en la organización:",
      },
      {
        id: "c1-8k",
        text: "Calidad de las relaciones interpersonales (formales y no formales) entre nosotros:",
      },
      {
        id: "c1-8l",
        text: "Apertura para ejecutar proyectos conjuntos entre diversas áreas a nuestro cargo:",
      },
      {
        id: "c1-8m",
        text: "Compromiso con metas de la organización y responsabilidades individuales para alcanzarlas:",
      },
      {
        id: "c1-8n",
        text: "Sabemos y respetamos quién puede decidir qué y cuándo:",
      },
      {
        id: "c1-8o",
        text: "Proactividad para resolver conflictos y diferencias de criterio en el equipo:",
      },
      {
        id: "c1-8p",
        text: "Apertura y cultura de retroalimentación mutua, directa y adecuada (asertividad):",
      },
      {
        id: "c1-8q",
        text: "Actitud de aprendizaje, mejoramiento, creatividad e innovación en equipo:",
      },
      {
        id: "c1-8r",
        text: "Desempeño como un solo equipo ante el resto de la organización; consistencia en el trato del personal:",
      },
      {
        id: "c1-8s",
        text: "Escucha activa, receptividad y respeto en la comunicación entre colegas o pares:",
      },
      {
        id: "c1-8t",
        text: "Percepción de equidad en nuestros beneficios e incentivos:",
      },
      {
        id: "c1-8u",
        text: "Somos ejemplo de práctica de valores y cultura deseada para la organización:",
      },
      {
        id: "c1-8v",
        text: "Cooperación, servicio y compromiso entre gerencias:",
      },
      {
        id: "c1-8w",
        text: "Cultura de reconocimiento y aprecio por logros individuales y de los departamentos:",
      },
      {
        id: "c1-8x",
        text: "Empoderamiento y auto-empoderamiento adecuado según nivel de responsabilidad:",
      },
      {
        id: "c1-8y",
        text: "Cumplimiento excelente y constante de responsabilidades individuales con el equipo:",
      },
    ],
  }),

  Q({
    id: "c1-9",
    order: 9,
    item: "En casi todo equipo de trabajo, hay situaciones que impiden lograr un mejor desempeño. Considerando los puntajes asignados en el cuadro anterior y otros factores adicionales: ¿Cuáles son tres situaciones sumamente relevantes que nos están impidiendo ser un mejor equipo y sobre las cuales debemos conversar abiertamente en este proceso pues de lo contrario las mismas continuarán afectando nuestro desempeño e integración?",
    type: "input_list",
    minEntries: 3,
    maxEntries: 3,
  }),

  Q({
    id: "c1-10",
    order: 10,
    item: "Las relaciones interpersonales constituyen un aspecto fundamental para el desarrollo y proyección de un equipo de trabajo. Creo que todo el equipo se fortalecería significativamente si las siguientes personas mejoraran la calidad de su relación personal y laboral. Solamente las personas mencionadas en esta respuesta conocerán el contenido de la misma, por lo tanto, escriba con la mayor apertura y franqueza.",
    type: "header",
  }),

  // 3 filas de pairing
  Q({
    id: "c1-10a",
    order: 10.1,
    item: "",
    type: "pairing_of_peers",
    minEntries: 0,
    maxEntries: 1,
    meta: { row: 1, leftLabel: "Persona", rightLabel: "Con" },
  }),
  Q({
    id: "c1-10b",
    order: 10.2,
    item: "",
    type: "pairing_of_peers",
    minEntries: 0,
    maxEntries: 1,
    meta: { row: 2, leftLabel: "Persona", rightLabel: "Con" },
  }),
  Q({
    id: "c1-10c",
    order: 10.3,
    item: "",
    type: "pairing_of_peers",
    minEntries: 0,
    maxEntries: 1,
    meta: { row: 3, leftLabel: "Persona", rightLabel: "Con" },
  }),
];

const OFFICIAL_C2 = [
  Q({
    id: "c2-0",
    order: 0,
    item: "Para:",
    type: "select_peer",
    minEntries: 1,
    maxEntries: 1,
    meta: {
      note: "En la app real, el peer viene por URL (/c2/:peerId).",
    },
  }),

  Q({
    id: "c2-1",
    order: 1,
    item: "Las primeras palabras que se me ocurren para describirle a usted son:",
    type: "input_list",
    minEntries: 2,
    maxEntries: 4,
  }),
  Q({
    id: "c2-2",
    order: 2,
    item: "Creo que sería muy positivo que usted siguiera haciendo lo siguiente como hasta ahora o que lo incrementara porque en esa manera nos beneficia a todos los que trabajamos y coordinamos acciones con usted en la organización",
    type: "input_list",
    minEntries: 2,
    maxEntries: 3,
  }),
  Q({
    id: "c2-3",
    order: 3,
    item: "La cualidad que todos nosotros más apreciamos en usted es:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 1,
  }),
  Q({
    id: "c2-4",
    order: 4,
    item: "Lo que los otros colegas del Equipo Líder más aprecian en usted es:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 1,
  }),
  Q({
    id: "c2-5",
    order: 5,
    item: "Con la mejor intención y sinceridad, quiero recomendarle hacer menos o dejar de hacer del todo lo siguiente pues así la productividad, las relaciones y el ambiente de trabajo entre nosotros en particular y en el Equipo Líder se fortalecerían:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 3,
  }),
  Q({
    id: "c2-6",
    order: 6,
    item: "En pocas palabras, creo que la opinión o imagen que otras personas en la organización tienen de usted es más o menos así:",
    type: "text_area",
    minEntries: 1,
    maxEntries: 1,
  }),

  Q({
    id: "c2-7",
    order: 7,
    item: "Pensando en los próximos años y en las necesidades de mejoramiento y desarrollo de la empresa, percibo que para tener un desempeño de mayor calidad a usted le convendría fortalecer los siguientes aspectos:",
    type: "header",
  }),
  Q({
    id: "c2-7a",
    order: 7.1,
    groupId: "c2-7",
    item: "Conocimientos:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 2,
  }),
  Q({
    id: "c2-7b",
    order: 7.2,
    groupId: "c2-7",
    item: "Actitudes:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 2,
  }),
  Q({
    id: "c2-7c",
    order: 7.3,
    groupId: "c2-7",
    item: "Habilidades:",
    type: "input_list",
    minEntries: 1,
    maxEntries: 2,
  }),

  Q({
    id: "c2-8",
    order: 8,
    item: "En síntesis, cuando le comparo con otras personas en posiciones de gerencia y jefatura en la organización considero que su ejecutoria general es:",
    type: "rating_fem_5",
    minEntries: 1,
    maxEntries: 1,
    meta: {
      labels: ["Insatisfactoria", "Regular", "Buena", "Muy Buena", "Excelente"],
      report: "frequency",
    },
  }),

  Q({
    id: "c2-9",
    order: 9,
    item: "Con mi mayor sinceridad, le expreso mi criterio sobre algunos aspectos de su estilo, desempeño y relaciones, utilizando la siguiente escala: (4) Excelente, (3) Muy Bueno, (2) Bueno (1) Regular, (0) Malo",
    type: "header",
  }),

  // 44 items 9.01..9.44 (flat; luego lo renderizamos en dos columnas en la UI del participante)
  ...[
    [
      "c2-9_01",
      9.01,
      "Preparación previa para reuniones y/o sesiones de trabajo:",
    ],
    [
      "c2-9_02",
      9.02,
      "Calidad y cantidad de información a otros para análisis y decisiones:",
    ],
    [
      "c2-9_03",
      9.03,
      "Calidad de su relación interpersonal con colegas gerentes:",
    ],
    [
      "c2-9_04",
      9.04,
      "Motivación para dialogar con usted sobre temas de confianza:",
    ],
    [
      "c2-9_05",
      9.05,
      "Innovación, aporte de visión e interés por practicar nuevas formas de trabajo:",
    ],
    [
      "c2-9_06",
      9.06,
      "Mi disposición para trabajar en equipo con usted en proyectos y servicios:",
    ],
    [
      "c2-9_07",
      9.07,
      "Compromiso y cumplimiento (rendición de cuentas) de acciones a su cargo:",
    ],
    [
      "c2-9_08",
      9.08,
      "Habilidad para coordinar actividades y trabajos específicos a su cargo:",
    ],
    [
      "c2-9_09",
      9.09,
      "Comunicación e información hacia el personal de su área:",
    ],
    [
      "c2-9_10",
      9.1,
      "Actitud gerencial, liderazgo en el cambio y apoyo a transformaciones:",
    ],
    [
      "c2-9_11",
      9.11,
      "Liderazgo colaborativo e incluyente hacia su jefe, colegas y colaboradores:",
    ],
    [
      "c2-9_12",
      9.12,
      "Tolerancia al criterio ajeno cuando el mismo es diferente al suyo:",
    ],
    [
      "c2-9_13",
      9.13,
      "Respeto, estima y confianza que inspira recibir de sus colegas gerentes:",
    ],
    [
      "c2-9_14",
      9.14,
      "Apertura y proactividad para ofrecer ayuda a otras áreas que no son la suya:",
    ],
    [
      "c2-9_15",
      9.15,
      "Lealtad y confidencialidad en temas analizados con usted:",
    ],
    [
      "c2-9_16",
      9.16,
      "Representante de la cultura, valores y códigos éticos de la organización:",
    ],
    [
      "c2-9_17",
      9.17,
      "Espíritu futurista, moderno e innovador para la gestión de la organización:",
    ],
    [
      "c2-9_18",
      9.18,
      "Receptividad, interés y consideración real de las ideas de los colegas y colaboradores:",
    ],
    [
      "c2-9_19",
      9.19,
      "Prudencia y moderación en sus críticas u observaciones (magnitud, ambiente o momento, sustentación):",
    ],
    [
      "c2-9_20",
      9.2,
      "Franqueza, no practica ni promueve el “chisme” ni el “serrucheo de piso”:",
    ],
    [
      "c2-9_21",
      9.21,
      "Compromiso con el equipo aun cuando está en desacuerdo con decisiones:",
    ],
    [
      "c2-9_22",
      9.22,
      "Receptividad para escuchar recomendaciones no provenientes de la Gerencia General:",
    ],
    [
      "c2-9_23",
      9.23,
      "Alineamiento del área a su cargo con estrategia, políticas y procedimientos de la organización:",
    ],
    [
      "c2-9_24",
      9.24,
      "Objetividad, profesionalismo y neutralidad en decisiones que nos influyen como equipo líder:",
    ],
    [
      "c2-9_25",
      9.25,
      "En general, calidad de relaciones humanas con el resto del personal de la organización:",
    ],
    [
      "c2-9_26",
      9.26,
      "Su apertura para recibir retroalimentación cuando todos sabemos que la necesita:",
    ],
    [
      "c2-9_27",
      9.27,
      "Habilidad para comunicar y persuadir sobre sus ideas, puntos de vista y propuestas:",
    ],
    [
      "c2-9_28",
      9.28,
      "Involucramiento y participación en actividades no formales de la organización:",
    ],
    [
      "c2-9_29",
      9.29,
      "Capacidad para dar seguimiento a detalles, pasión por la ejecución:",
    ],
    [
      "c2-9_30",
      9.3,
      "Generación de confianza en sus ideas: proyecta decisión y voluntad para actuar:",
    ],
    [
      "c2-9_31",
      9.31,
      "Inspira positivismo, entusiasmo, superación y actitud proactiva ante los retos:",
    ],
    [
      "c2-9_32",
      9.32,
      "Control personal, serenidad o “auto-gerencia”, bajo condiciones de alta presión:",
    ],
    [
      "c2-9_33",
      9.33,
      "Calidad de relación profesional, jerárquica y personal con su jefe inmediato:",
    ],
    [
      "c2-9_34",
      9.34,
      "Calidad de liderazgo, dirección y confianza en su área de responsabilidad:",
    ],
    [
      "c2-9_35",
      9.35,
      "Humildad para reconocer errores, desconocimiento o debilidades personales:",
    ],
    [
      "c2-9_36",
      9.36,
      "Balance entre capacidad profesional-técnica (resultados) y ambiente de trabajo en su área:",
    ],
    [
      "c2-9_37",
      9.37,
      "Orden en la conducción de asuntos y actividades a su cargo:",
    ],
    [
      "c2-9_38",
      9.38,
      "Contribución a armonía, ambiente positivo, coordinación y eficiencia en Equipo Líder:",
    ],
    [
      "c2-9_39",
      9.39,
      "Proactividad para compartir conocimientos de su especialidad con colegas y colaboradores:",
    ],
    [
      "c2-9_40",
      9.4,
      "Liderazgo y credibilidad que proyecta al personal de la organización en general:",
    ],
    [
      "c2-9_41",
      9.41,
      "Capacidad para resolver conflictos y “dejar atrás” situaciones ya resueltas sin actitudes negativas ni resentimientos:",
    ],
    [
      "c2-9_42",
      9.42,
      "Puntualidad general: reuniones, actividades y responsabilidades:",
    ],
    [
      "c2-9_43",
      9.43,
      "Orientación a resultados extraordinarios, crecientes y sostenibles en su área:",
    ],
    [
      "c2-9_44",
      9.44,
      "Alineamiento y motivación de su equipo con filosofía y metas de la organización:",
    ],
  ].map(([id, order, item]) =>
    Q({
      id,
      order,
      groupId: "c2-9",
      item,
      type: "value_0_4",
      minEntries: 1,
      maxEntries: 1,
      meta: {
        scale: [0, 1, 2, 3, 4],
        labels: ["Malo", "Regular", "Bueno", "Muy Bueno", "Excelente"],
        report: "avg",
      },
    }),
  ),

  Q({
    id: "c2-10",
    order: 10,
    item: "Interpreto que los tres valores o principios más relevantes que usted ha procurado promover con sus conductas, actitudes y planteamientos son:",
    type: "input_list",
    minEntries: 3,
    maxEntries: 3,
  }),

  Q({
    id: "c2-11",
    order: 11,
    item: "En una escala de 0 a 10, el grado de satisfacción que yo tengo al trabajar con usted es:",
    type: "evaluation_0_10",
    minEntries: 1,
    maxEntries: 1,
    meta: { min: 0, max: 10, report: "avg" },
  }),

  Q({
    id: "c2-12",
    order: 12,
    item: "Estimado/a <peer>: Desde hace mucho tiempo había deseado tener una oportunidad como esta para expresarle un comentario, inquietud, observación constructiva o simplemente compartir una percepción sobre su desempeño, actitudes y relaciones. Si usted desea mejorar su gestión gerencial y liderazgo, sería muy conveniente que reflexionara sobre aspectos que pueden ayudarle a continuar siendo una persona de valor extraordinario en este equipo y la organización. Por eso, con toda mi sinceridad y buena intención, le exhorto a tomar en consideración lo siguiente:",
    type: "text_area",
    minEntries: 1,
    maxEntries: 1,
    meta: { renderStyle: "letter", tokenPeer: "<peer>" },
  }),
];

function truncate(s, n = 90) {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

export default function MasterTemplates() {
  const navigate = useNavigate();

  const [kind, setKind] = React.useState("c1"); // c1 | c2
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");

  const [instructionsMd, setInstructionsMd] = React.useState("");
  const [questions, setQuestions] = React.useState([]);

  function updateQuestionField(id, field, value) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    );
  }

  /* Funciones para grids (o tablas de preguntas) */
  function updateGridItem(qId, itemIndex, field, value) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const items = Array.isArray(q.items) ? q.items.slice() : [];
        if (!items[itemIndex]) return q;

        items[itemIndex] = {
          ...items[itemIndex],
          [field]: value,
        };

        return { ...q, items };
      }),
    );
  }

  function addGridItem(qId) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const items = Array.isArray(q.items) ? q.items.slice() : [];
        items.push({
          id: `${qId}-${items.length + 1}`,
          text: "",
        });
        return { ...q, items };
      }),
    );
  }

  function removeGridItem(qId, index) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const items = Array.isArray(q.items) ? q.items.slice() : [];
        items.splice(index, 1);
        return { ...q, items };
      }),
    );
  }

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
  }

  async function load(k) {
    setLoading(true);
    setError("");
    try {
      const tpl = await auth.fetch(`/api/admin/base-templates/${k}`);
      setInstructionsMd(tpl?.instructionsMd || "");
      setQuestions(Array.isArray(tpl?.questions) ? tpl.questions : []);
    } catch (e) {
      setError(e?.message || "No se pudo cargar la plantilla.");
      setInstructionsMd("");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      await auth.fetch(`/api/admin/base-templates/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ instructionsMd, questions }),
      });
      setFlash("Plantilla guardada.");
    } catch (e) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    kind === "c1" ? "Plantilla Maestra — C1" : "Plantilla Maestra — C2";
  const subtitle =
    kind === "c1"
      ? "Estas instrucciones y preguntas se copiarán a cada proceso nuevo (C1)."
      : "Estas instrucciones y preguntas se copiarán a cada proceso nuevo (C2).";

  const qCount = questions.length;

  return (
    <div className="page">
      <div className="page-inner">
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Link to="/admin/processes" className="btn">
            {"<"} Volver
          </Link>

          <button className="btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 className="h1" style={{ margin: 0 }}>
              {title}
            </h1>
            <p className="sub" style={{ marginTop: 6 }}>
              {subtitle}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Tab active={kind === "c1"} onClick={() => setKind("c1")}>
              C1
            </Tab>
            <Tab active={kind === "c2"} onClick={() => setKind("c2")}>
              C2
            </Tab>

            <button
              className="btn"
              onClick={onSave}
              disabled={saving || loading}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>

        {loading && <p className="sub">Cargando…</p>}
        {error && <div className="error">{error}</div>}
        {flash && !error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.90)",
              fontSize: 13,
            }}
          >
            {flash}
          </div>
        )}

        {/* Editor + Preview */}
        {!loading && (
          <>
            <div className="section" style={{ marginTop: 14 }}>
              <div className="section-body">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <p className="sub" style={{ marginTop: 0 }}>
                      Markdown
                    </p>
                    <textarea
                      className="admin-textarea"
                      style={{ minHeight: 320 }}
                      value={instructionsMd}
                      onChange={(e) => setInstructionsMd(e.target.value)}
                      placeholder="Escribí aquí las instrucciones en Markdown…"
                    />
                    <p className="sub" style={{ marginTop: 10, opacity: 0.8 }}>
                      Tip: podés usar títulos, listas y **negritas**.
                    </p>
                  </div>

                  <div>
                    <p className="sub" style={{ marginTop: 0 }}>
                      Preview
                    </p>
                    <div
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.22)",
                        padding: 12,
                        minHeight: 320,
                      }}
                    >
                      <Markdown text={instructionsMd || ""} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    onClick={onSave}
                    disabled={saving || loading}
                  >
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => load(kind)}
                    disabled={saving || loading}
                  >
                    Recargar
                  </button>
                </div>
              </div>
            </div>

            {/* Questions preview */}
            <div className="section" style={{ marginTop: 14 }}>
              <div className="section-body">
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2 className="h2" style={{ margin: 0 }}>
                      Preguntas
                    </h2>
                    <p className="sub" style={{ marginTop: 6 }}>
                      Total: <strong>{qCount}</strong>
                    </p>
                  </div>
                </div>

                {qCount === 0 ? (
                  <p className="sub">No hay preguntas configuradas.</p>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: 10 }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 760,
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                              width: 90,
                            }}
                          >
                            Orden
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                              width: 190,
                            }}
                          >
                            Tipo
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                            }}
                          >
                            Item
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {questions
                          .slice()
                          .sort(
                            (a, b) =>
                              (Number(a?.order) || 0) - (Number(b?.order) || 0),
                          )
                          .map((q) => (
                            <tr key={q.id}>
                              {/* ORDER */}
                              <td style={{ padding: "8px" }}>
                                <input
                                  className="admin-input"
                                  style={{ width: 80 }}
                                  value={q.order ?? ""}
                                  onChange={(e) =>
                                    updateQuestionField(
                                      q.id,
                                      "order",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </td>

                              {/* TYPE */}
                              <td style={{ padding: "8px" }}>
                                <select
                                  className="admin-input"
                                  value={q.type || ""}
                                  onChange={(e) =>
                                    updateQuestionField(
                                      q.id,
                                      "type",
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="header">header</option>
                                  <option value="input_list">input_list</option>
                                  <option value="text_area">text_area</option>
                                  <option value="binary_yes_no">
                                    binary_yes_no
                                  </option>
                                  <option value="rating_masc_5">
                                    rating_masc_5
                                  </option>
                                  <option value="rating_fem_5">
                                    rating_fem_5
                                  </option>
                                  <option value="value_0_4">value_0_4</option>
                                  <option value="evaluation_0_10">
                                    evaluation_0_10
                                  </option>
                                  <option value="pairing_rows">
                                    pairing_rows
                                  </option>
                                  <option value="value_0_4_grid">
                                    value_0_4_grid
                                  </option>
                                </select>
                              </td>

                              {/* ITEM */}
                              <td style={{ padding: "8px" }}>
                                <textarea
                                  className="admin-textarea"
                                  style={{ minHeight: 60 }}
                                  value={q.item || ""}
                                  onChange={(e) =>
                                    updateQuestionField(
                                      q.id,
                                      "item",
                                      e.target.value,
                                    )
                                  }
                                />
                                {q.type === "value_0_4_grid" && (
                                  <div
                                    style={{
                                      marginTop: 12,
                                      padding: 10,
                                      borderRadius: 10,
                                      background: "rgba(0,0,0,0.18)",
                                      border:
                                        "1px solid rgba(255,255,255,0.08)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        marginBottom: 8,
                                      }}
                                    >
                                      Items del grid
                                    </div>

                                    {(Array.isArray(q.items)
                                      ? q.items
                                      : []
                                    ).map((it, idx) => (
                                      <div
                                        key={idx}
                                        style={{
                                          display: "flex",
                                          gap: 8,
                                          marginBottom: 6,
                                          alignItems: "center",
                                        }}
                                      >
                                        <input
                                          className="admin-input"
                                          style={{ width: 140 }}
                                          value={it.id || ""}
                                          onChange={(e) =>
                                            updateGridItem(
                                              q.id,
                                              idx,
                                              "id",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="id"
                                        />

                                        <input
                                          className="admin-input"
                                          style={{ flex: 1 }}
                                          value={it.text || ""}
                                          onChange={(e) =>
                                            updateGridItem(
                                              q.id,
                                              idx,
                                              "text",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="texto"
                                        />

                                        <button
                                          className="btn"
                                          type="button"
                                          onClick={() =>
                                            removeGridItem(q.id, idx)
                                          }
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))}

                                    <button
                                      className="btn"
                                      type="button"
                                      onClick={() => addGridItem(q.id)}
                                    >
                                      + Agregar fila
                                    </button>
                                  </div>
                                )}
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    marginTop: 6,
                                  }}
                                >
                                  <input
                                    className="admin-input"
                                    style={{ width: 110 }}
                                    placeholder="minEntries"
                                    value={q.minEntries ?? ""}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        q.id,
                                        "minEntries",
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                      )
                                    }
                                  />

                                  <input
                                    className="admin-input"
                                    style={{ width: 110 }}
                                    placeholder="maxEntries"
                                    value={q.maxEntries ?? ""}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        q.id,
                                        "maxEntries",
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                      )
                                    }
                                  />

                                  <input
                                    className="admin-input"
                                    style={{ width: 140 }}
                                    placeholder="groupId"
                                    value={q.groupId || ""}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        q.id,
                                        "groupId",
                                        e.target.value || null,
                                      )
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Nota global */}
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                opacity: 0.65,
                lineHeight: 1.4,
              }}
            >
              Nota: los procesos ya creados mantienen sus propias plantillas.
              Estas plantillas maestras afectan únicamente a procesos nuevos.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
