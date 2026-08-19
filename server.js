require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");

const app = express();

/* =========================================================
   SERVER SETTINGS
   ========================================================= */

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

/*
   Your website files are inside:

   DCs-Project-AI
      └── public
           ├── index.html
           ├── ...
*/
app.use(express.static("public"));

/* =========================================================
   GEMINI
   ========================================================= */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.log("");
    console.log("WARNING:");
    console.log("GEMINI_API_KEY was not found in .env");
    console.log("");
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

const GEMINI_MODEL = "gemini-3.6-flash";

/* =========================================================
   BASIC GEMINI FUNCTION
   ========================================================= */

async function askGemini(contents, config = {}) {

    const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: contents,
        config: config
    });

    return response;
}

/* =========================================================
   NORMAL AI CHAT
   ========================================================= */

app.post("/api/chat", async (req, res) => {

    try {

        const message = String(
            req.body?.message || ""
        ).trim();

        if (!message) {

            return res.status(400).json({
                error: "Please enter a message."
            });
        }

        console.log("AI chat request received.");

        const response = await askGemini(message);

        res.json({
            reply: response.text || ""
        });

    } catch (error) {

        console.error("");
        console.error("CHAT ERROR:");
        console.error(error);
        console.error("");

        res.status(500).json({
            error:
                error?.message ||
                "AI chat failed."
        });
    }
});

/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

const upload = multer({

    storage: multer.memoryStorage(),

    limits: {
        fileSize: 12 * 1024 * 1024
    },

    fileFilter: (req, file, callback) => {

        if (
            file.mimetype &&
            file.mimetype.startsWith("image/")
        ) {

            callback(null, true);

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
   REMOVE MARKDOWN FROM GEMINI JSON
   ========================================================= */

function cleanGeminiJSON(text) {

    let result = String(text || "").trim();

    /*
       Sometimes Gemini returns:

       ```json
       {...}
       ```

       Remove those fences.
    */

    result = result.replace(
        /^```json\s*/i,
        ""
    );

    result = result.replace(
        /^```\s*/i,
        ""
    );

    result = result.replace(
        /\s*```$/i,
        ""
    );

    return result.trim();
}

/* =========================================================
   PARSE GEMINI JSON
   ========================================================= */

function parseGeminiJSON(text) {

    const cleaned = cleanGeminiJSON(text);

    try {

        return JSON.parse(cleaned);

    } catch (firstError) {

        /*
           If Gemini added text before/after JSON,
           try extracting the JSON object.
        */

        const firstBrace =
            cleaned.indexOf("{");

        const lastBrace =
            cleaned.lastIndexOf("}");

        if (
            firstBrace >= 0 &&
            lastBrace > firstBrace
        ) {

            const jsonPart =
                cleaned.substring(
                    firstBrace,
                    lastBrace + 1
                );

            return JSON.parse(jsonPart);
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

    if (!Array.isArray(data.variables)) {

        data.variables = [];
    }

    data.variables =
        data.variables
            .map(v => String(v).trim())
            .filter(Boolean);

    if (
        data.type !== "truth_table" &&
        data.type !== "logic_diagram"
    ) {

        data.type = "truth_table";
    }

    if (!Array.isArray(data.outputs)) {

        data.outputs = [];
    }

    if (!Array.isArray(data.rows)) {

        data.rows = [];
    }

    /*
       Normalize truth-table rows.
    */

    data.rows = data.rows.map((row, index) => {

        let inputs = [];

        if (Array.isArray(row.inputs)) {

            inputs = row.inputs.map(
                value => Number(value)
            );
        }

        let output =
            Number(row.output);

        if (
            output !== 0 &&
            output !== 1
        ) {

            output = 0;
        }

        return {

            index:
                Number.isInteger(row.index)
                    ? row.index
                    : index,

            inputs: inputs,

            output: output
        };
    });

    if (!Array.isArray(data.gates)) {

        data.gates = [];
    }

    if (!Array.isArray(data.intermediateSignals)) {

        data.intermediateSignals = [];
    }

    if (!Array.isArray(data.minterms)) {

        data.minterms = [];
    }

    if (!Array.isArray(data.maxterms)) {

        data.maxterms = [];
    }

    return data;
}

/* =========================================================
   DIGITAL ELECTRONICS IMAGE PROMPT
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
- Preserve the order of the input variables.
- Preserve the order of the rows.
- Extract 0 and 1 values.
- Determine the Boolean function.
- Determine minterms.
- Determine maxterms.

For a truth table:

type must be:

"truth_table"

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
BOOLEAN NOTATION
=========================================================

Use:

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

Parentheses are allowed.

=========================================================
OUTPUT FORMAT
=========================================================

Return ONLY valid JSON.

Do NOT use Markdown.

Do NOT use:

\`\`\`json

Do NOT write an explanation outside the JSON.

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

    "explanation": "Short explanation.",

    "confidence": "high",

    "notes": ""
}

=========================================================
IMPORTANT RULES
=========================================================

For a truth table:

- Every readable row must be included.
- Use integer 0 and 1.
- The row index starts at 0.
- Minterms are row indexes where output = 1.
- Maxterms are row indexes where output = 0.

Example:

A B Y

0 0 1
0 1 0
1 0 1
1 1 0

Then:

minterms:

[0,2]

maxterms:

[1,3]

For a logic diagram:

Set:

"type": "logic_diagram"

Example gate:

{
    "type": "AND",
    "inputs": ["A","B"],
    "output": "N1"
}

If there are intermediate signals:

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

If the circuit is small enough to enumerate, also create
a truth table for the FIRST output.

Do not guess unreadable parts.

If something cannot be determined, mention it in:

"notes"

=========================================================
`;



/* =========================================================
   IMAGE ANALYSIS API
   ========================================================= */

app.post(
    "/api/analyze-truth-table",
    upload.single("image"),

    async (req, res) => {

        try {

            /* ---------------------------------------------
               Check image
            --------------------------------------------- */

            if (!req.file) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "No image was uploaded."
                });
            }

            console.log("");
            console.log("==============================");
            console.log("IMAGE ANALYSIS STARTED");
            console.log("==============================");

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

            /* ---------------------------------------------
               Convert image to Base64
            --------------------------------------------- */

            const imageBase64 =
                req.file.buffer.toString(
                    "base64"
                );

            /* ---------------------------------------------
               Send image + instructions to Gemini
            --------------------------------------------- */

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
                                    req.file.mimetype,

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

            /* ---------------------------------------------
               Parse response
            --------------------------------------------- */

            const rawText =
                response.text || "";

            const parsed =
                parseGeminiJSON(
                    rawText
                );

            /* ---------------------------------------------
               Validate
            --------------------------------------------- */

            const analysis =
                validateAnalysis(
                    parsed
                );

            /* ---------------------------------------------
               Calculate minterms/maxterms ourselves
               so they are NEVER dependent on Gemini.
            --------------------------------------------- */

            if (
                analysis.rows &&
                analysis.rows.length > 0
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

            /* ---------------------------------------------
               Log result
            --------------------------------------------- */

            console.log("");
            console.log(
                "ANALYSIS TYPE:",
                analysis.type
            );

            console.log(
                "VARIABLES:",
                analysis.variables
            );

            console.log(
                "OUTPUTS:",
                analysis.outputs
            );

            console.log(
                "ROWS:",
                analysis.rows.length
            );

            console.log(
                "MINTERMS:",
                analysis.minterms
            );

            console.log(
                "MAXTERMS:",
                analysis.maxterms
            );

            console.log(
                "GATES:",
                analysis.gates
            );

            console.log("");
            console.log(
                "IMAGE ANALYSIS SUCCESS"
            );
            console.log("");

            /* ---------------------------------------------
               Send structured result to website
            --------------------------------------------- */

            return res.json({

                ok: true,

                analysis: analysis
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

            console.error(
                error
            );

            let message =
                error?.message ||
                "Image analysis failed.";

            /* ---------------------------------------------
               Friendly API-key error
            --------------------------------------------- */

            if (
                /api key/i.test(message) ||
                /authentication/i.test(message) ||
                /unauthenticated/i.test(message) ||
                /permission/i.test(message)
            ) {

                message =
                    "Gemini API key is missing or invalid. Check GEMINI_API_KEY in your .env file.";
            }

            return res.status(500).json({

                ok: false,

                error: message
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
            error instanceof multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Image is too large. Maximum size is 12 MB."
                });
            }

            return res.status(400).json({

                ok: false,

                error:
                    "Image upload error: " +
                    error.message
            });
        }

        if (error) {

            return res.status(400).json({

                ok: false,

                error:
                    error.message
            });
        }

        next();
    }
);

/* =========================================================
   START SERVER
   ========================================================= */

// ==================================================
// START SERVER
// ==================================================

if (require.main === module) {
    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log("");
            console.log("================================");
            console.log("DC'S PROJECT AI SERVER");
            console.log("================================");
            console.log(
                `Server running at http://localhost:${PORT}`
            );
            console.log("Image analyzer: READY");
            console.log("AI chat: READY");
            console.log("================================");
            console.log("");
        }
    );
}

module.exports = app;