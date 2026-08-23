require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");

const app = express();

/* =========================================================
   SERVER
   ========================================================= */

const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

/*
   Website files:
   DCs-Project-AI
      └── public
           └── index.html
*/

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   GEMINI CONFIG
   ========================================================= */

const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";

const GEMINI_MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.7-flash";

if (!API_KEY) {
    console.error("");
    console.error(
        "GEMINI API KEY MISSING"
    );
    console.error(
        "Set GEMINI_API_KEY in .env locally or in Vercel Environment Variables."
    );
    console.error("");
}

const ai = API_KEY
    ? new GoogleGenAI({
        apiKey: API_KEY
      })
    : null;

/* =========================================================
   GEMINI ERROR HANDLER
   ========================================================= */

function friendlyGeminiError(error) {

    const raw = String(
        error?.message ||
        error?.error?.message ||
        error ||
        "Unknown Gemini error."
    );

    if (
        /api key/i.test(raw) ||
        /api_key/i.test(raw) ||
        /authentication/i.test(raw) ||
        /unauthenticated/i.test(raw) ||
        /invalid.*key/i.test(raw) ||
        /permission denied/i.test(raw)
    ) {
        return (
            "Gemini API key is missing, invalid, blocked, " +
            "or unavailable to this deployment. " +
            "Check GEMINI_API_KEY / GOOGLE_API_KEY " +
            "in Vercel Environment Variables, then redeploy."
        );
    }

    if (
        /not found/i.test(raw) ||
        /404/i.test(raw) ||
        /no longer available/i.test(raw)
    ) {
        return (
            `Gemini model "${GEMINI_MODEL}" was rejected. ` +
            "Set GEMINI_MODEL to a model available to your API key."
        );
    }

    if (
        /quota/i.test(raw) ||
        /rate limit/i.test(raw) ||
        /resource exhausted/i.test(raw) ||
        /429/i.test(raw)
    ) {
        return (
            "Gemini API quota or rate limit was reached. " +
            "Check your Gemini API usage and limits."
        );
    }

    return raw;
}

/* =========================================================
   GEMINI REQUEST
   ========================================================= */

async function askGemini(
    contents,
    config = {}
) {

    if (!ai) {
        throw new Error(
            "Gemini API key is not configured."
        );
    }

    return ai.models.generateContent({

        model: GEMINI_MODEL,

        contents: contents,

        config: config

    });
}

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            ok: true,

            server:
                "DC'S PROJECT AI",

            geminiConfigured:
                Boolean(API_KEY),

            model:
                GEMINI_MODEL,

            environment:
                process.env.VERCEL
                    ? "vercel"
                    : "local"

        });
    }
);

/* =========================================================
   GEMINI TEST
   ========================================================= */

app.get(
    "/api/gemini-test",
    async (req, res) => {

        try {

            const response =
                await askGemini(
                    "Reply with exactly: GEMINI_OK",

                    {
                        temperature: 0
                    }
                );

            res.json({

                ok: true,

                reply:
                    response.text || "",

                model:
                    GEMINI_MODEL

            });

        } catch (error) {

            console.error(
                "GEMINI TEST ERROR:"
            );

            console.error(error);

            res.status(500).json({

                ok: false,

                error:
                    friendlyGeminiError(
                        error
                    ),

                model:
                    GEMINI_MODEL

            });
        }
    }
);

/* =========================================================
   NORMAL AI CHAT
   ========================================================= */

app.post(
    "/api/chat",
    async (req, res) => {

        try {

            const message =
                String(
                    req.body?.message || ""
                ).trim();

            if (!message) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Please enter a message."
                });
            }

            console.log(
                "AI chat request received."
            );

            const response =
                await askGemini(
                    message
                );

            return res.json({

                ok: true,

                reply:
                    response.text || ""

            });

        } catch (error) {

            console.error("");
            console.error(
                "=============================="
            );
            console.error(
                "CHAT ERROR"
            );
            console.error(
                "=============================="
            );
            console.error(error);

            return res.status(500).json({

                ok: false,

                error:
                    friendlyGeminiError(
                        error
                    ),

                model:
                    GEMINI_MODEL

            });
        }
    }
);

/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

const upload =
    multer({

        storage:
            multer.memoryStorage(),

        limits: {

            fileSize:
                4 * 1024 * 1024

        },

        fileFilter:
            (req, file, callback) => {

                if (
                    file.mimetype &&
                    file.mimetype.startsWith(
                        "image/"
                    )
                ) {

                    callback(
                        null,
                        true
                    );

                } else {

                    callback(
                        new Error(
                            "Only image files are allowed."
                        )
                    );
                }
            }

    });

/* =========================================================
   CLEAN GEMINI JSON
   ========================================================= */

function cleanGeminiJSON(text) {

    let result =
        String(
            text || ""
        ).trim();

    result =
        result.replace(
            /^```json\s*/i,
            ""
        );

    result =
        result.replace(
            /^```\s*/i,
            ""
        );

    result =
        result.replace(
            /\s*```$/i,
            ""
        );

    return result.trim();
}

/* =========================================================
   PARSE GEMINI JSON
   ========================================================= */

function parseGeminiJSON(text) {

    const cleaned =
        cleanGeminiJSON(
            text
        );

    try {

        return JSON.parse(
            cleaned
        );

    } catch (firstError) {

        const firstBrace =
            cleaned.indexOf("{");

        const lastBrace =
            cleaned.lastIndexOf("}");

        if (
            firstBrace >= 0 &&
            lastBrace > firstBrace
        ) {

            return JSON.parse(
                cleaned.slice(
                    firstBrace,
                    lastBrace + 1
                )
            );
        }

        throw firstError;
    }
}

/* =========================================================
   VALIDATE IMAGE ANALYSIS
   ========================================================= */

function validateAnalysis(data) {

    if (!data) {

        throw new Error(
            "Gemini returned an empty analysis."
        );
    }

    if (
        !Array.isArray(
            data.variables
        )
    ) {

        data.variables = [];
    }

    data.variables =
        data.variables
            .map(
                v =>
                    String(v).trim()
            )
            .filter(Boolean);

    if (
        data.type !==
            "truth_table" &&
        data.type !==
            "logic_diagram"
    ) {

        data.type =
            "truth_table";
    }

    if (
        !Array.isArray(
            data.outputs
        )
    ) {

        data.outputs = [];
    }

    if (
        !Array.isArray(
            data.rows
        )
    ) {

        data.rows = [];
    }

    data.rows =
        data.rows.map(
            (row, index) => ({

                index:
                    Number.isInteger(
                        row.index
                    )
                        ? row.index
                        : index,

                inputs:
                    Array.isArray(
                        row.inputs
                    )
                        ? row.inputs.map(
                            Number
                        )
                        : [],

                output:
                    Number(
                        row.output
                    ) === 1
                        ? 1
                        : 0

            })
        );

    if (
        !Array.isArray(
            data.gates
        )
    ) {

        data.gates = [];
    }

    if (
        !Array.isArray(
            data.connections
        )
    ) {

        data.connections = [];
    }

    if (
        !Array.isArray(
            data.intermediateSignals
        )
    ) {

        data.intermediateSignals = [];
    }

    if (
        !Array.isArray(
            data.minterms
        )
    ) {

        data.minterms = [];
    }

    if (
        !Array.isArray(
            data.maxterms
        )
    ) {

        data.maxterms = [];
    }

    return data;
}

/* =========================================================
   IMAGE ANALYSIS PROMPT
   ========================================================= */

const IMAGE_ANALYSIS_PROMPT = `

You are the image-analysis engine for a Digital Electronics
educational website.

The uploaded image can be either:

1. A TRUTH TABLE

OR

2. A DIGITAL LOGIC / LOGIC-GATE CIRCUIT DIAGRAM.

You must inspect the actual image carefully.

=========================================================
TRUTH TABLE
=========================================================

If the image contains a truth table:

- Identify every input variable.
- Identify every output variable.
- Read every visible row.
- Preserve the order of input variables.
- Preserve the order of rows.
- Extract 0 and 1 values.
- Determine the Boolean function.
- Determine minterms.
- Determine maxterms.

For a truth table:

"type": "truth_table"

=========================================================
LOGIC CIRCUIT
=========================================================

If the image contains a logic-gate circuit:

Identify:

- Inputs
- Outputs
- AND gates
- OR gates
- NOT gates
- NAND gates
- NOR gates
- XOR gates
- XNOR gates
- Inverters
- Wire connections
- Intermediate signals

Trace the circuit from LEFT to RIGHT.

Pay special attention to:

- Small circles/bubbles on gate outputs.
- Which wires actually connect.
- Which wires cross without connecting.
- Multiple outputs.
- Intermediate gates.

Determine the Boolean expression for every output.

=========================================================
WIRE CONNECTION ANALYSIS
=========================================================

When analyzing a logic-gate diagram:

DO NOT only list the gates.

Reconstruct the actual topology.

For every gate determine:

- Which signal enters input 1.
- Which signal enters input 2.
- Which signal is produced by the gate.
- Which later gate receives that signal.
- Whether crossing wires actually connect.
- Whether a junction/dot indicates a connection.

Return an explicit "connections" array.

Example:

"connections": [
    {
        "from": "A",
        "to": "G1.input1",
        "signal": "A"
    },
    {
        "from": "B",
        "to": "G1.input2",
        "signal": "B"
    },
    {
        "from": "G1.output",
        "to": "G2.input1",
        "signal": "N1"
    }
]

Do not invent wire connections.

=========================================================
BOOLEAN NOTATION
=========================================================

NOT:

A'

AND:

A.B

OR:

A+B

NAND:

(A.B)'

NOR:

(A+B)'

XOR:

A'B + AB'

XNOR:

AB + A'B'

=========================================================
OUTPUT FORMAT
=========================================================

Return ONLY valid JSON.

Do NOT use Markdown.

Do NOT use code fences.

Use this exact structure:

{
    "type": "truth_table",

    "variables": [
        "A",
        "B"
    ],

    "outputs": [
        {
            "name": "Y",
            "expression": "A.B",
            "simplified": "A.B"
        }
    ],

    "output": "Y",

    "rows": [
        {
            "index": 0,
            "inputs": [0,0],
            "output": 0
        },
        {
            "index": 1,
            "inputs": [0,1],
            "output": 1
        }
    ],

    "minterms": [1],

    "maxterms": [0],

    "intermediateSignals": [],

    "gates": [],

    "connections": [],

    "explanation": "Short explanation.",

    "confidence": "high",

    "notes": ""
}

=========================================================
TRUTH TABLE RULES
=========================================================

- Every readable row must be included.
- Use integer 0 and 1.
- Row numbering starts at 0.
- Minterms are rows where output = 1.
- Maxterms are rows where output = 0.

Example:

A B Y

0 0 1
0 1 0
1 0 1
1 1 0

Minterms:

[0,2]

Maxterms:

[1,3]

=========================================================
LOGIC DIAGRAM RULES
=========================================================

For a logic diagram:

"type":

"logic_diagram"

Example gate:

{
    "id": "G1",
    "type": "AND",
    "inputs": ["A","B"],
    "output": "N1"
}

Example connection:

{
    "from": "G1.output",
    "to": "G2.input1",
    "signal": "N1"
}

If an intermediate signal exists:

{
    "name": "N1",
    "expression": "A.B"
}

For every output:

{
    "name": "Y",
    "expression": "A.B+C",
    "simplified": "A.B+C"
}

If the circuit is small enough to enumerate,
also create a truth table for the FIRST output.

If something is genuinely unreadable,
put it in "notes" instead of guessing.

`;

/* =========================================================
   IMAGE ANALYSIS API
   ========================================================= */

app.post(
    "/api/analyze-truth-table",

    upload.single("image"),

    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "No image was uploaded."

                });
            }

            console.log("");
            console.log(
                "=============================="
            );
            console.log(
                "IMAGE ANALYSIS STARTED"
            );
            console.log(
                "=============================="
            );

            console.log(
                "File:",
                req.file.originalname
            );

            console.log(
                "Type:",
                req.file.mimetype
            );

            console.log(
                "Size:",
                req.file.size,
                "bytes"
            );

            const imageBase64 =
                req.file.buffer.toString(
                    "base64"
                );

            const response =
                await askGemini(

                    [
                        {
                            text:
                                IMAGE_ANALYSIS_PROMPT
                        },

                        {
                            inlineData: {

                                mimeType:
                                    req.file
                                        .mimetype,

                                data:
                                    imageBase64
                            }
                        }

                    ],

                    {
                        responseMimeType:
                            "application/json"
                    }

                );

            console.log(
                "Gemini response received."
            );

            const parsed =
                parseGeminiJSON(
                    response.text || ""
                );

            const analysis =
                validateAnalysis(
                    parsed
                );

            /*
               Calculate minterms and maxterms ourselves.
            */

            if (
                analysis.rows.length
            ) {

                analysis.minterms =
                    analysis.rows
                        .filter(
                            row =>
                                row.output === 1
                        )
                        .map(
                            row =>
                                row.index
                        );

                analysis.maxterms =
                    analysis.rows
                        .filter(
                            row =>
                                row.output === 0
                        )
                        .map(
                            row =>
                                row.index
                        );
            }

            console.log(
                "IMAGE ANALYSIS SUCCESS"
            );

            console.log(
                "TYPE:",
                analysis.type
            );

            console.log(
                "VARIABLES:",
                analysis.variables
            );

            console.log(
                "MINTERMS:",
                analysis.minterms
            );

            console.log(
                "MAXTERMS:",
                analysis.maxterms
            );

            return res.json({

                ok: true,

                analysis:
                    analysis

            });

        } catch (error) {

            console.error("");
            console.error(
                "=============================="
            );
            console.error(
                "IMAGE ANALYSIS ERROR"
            );
            console.error(
                "=============================="
            );

            console.error(error);

            return res.status(500).json({

                ok: false,

                error:
                    friendlyGeminiError(
                        error
                    ),

                model:
                    GEMINI_MODEL

            });
        }
    }
);

/* =========================================================
   MULTER ERROR HANDLER
   ========================================================= */

app.use(
    (error, req, res, next) => {

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(
                    400
                ).json({

                    ok: false,

                    error:
                        "Image is too large. Maximum size is 4 MB."

                });
            }

            return res.status(
                400
            ).json({

                ok: false,

                error:
                    "Image upload error: " +
                    error.message

            });
        }

        if (error) {

            return res.status(
                400
            ).json({

                ok: false,

                error:
                    error.message

            });
        }

        next();
    }
);

/* =========================================================
   LOCAL + VERCEL
   ========================================================= */

if (
    require.main === module
) {

    app.listen(

        PORT,

        "0.0.0.0",

        () => {

            console.log("");

            console.log(
                "================================"
            );

            console.log(
                "DC'S PROJECT AI SERVER"
            );

            console.log(
                "================================"
            );

            console.log(
                `Server running at http://localhost:${PORT}`
            );

            console.log(
                `Gemini model: ${GEMINI_MODEL}`
            );

            console.log(
                `Gemini key: ${
                    API_KEY
                        ? "CONFIGURED"
                        : "MISSING"
                }`
            );

            console.log(
                "Image analyzer: READY"
            );

            console.log(
                "AI chat: READY"
            );

            console.log(
                "================================"
            );

            console.log("");
        }
    );
}

/* =========================================================
   VERCEL EXPORT
   ========================================================= */

module.exports = app;
