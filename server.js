require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");

const app = express();


// ==================================================
// MIDDLEWARE
// ==================================================

app.use(cors());
app.use(express.json());

// Serve your website
app.use(express.static("public"));


// ==================================================
// GEMINI SETUP
// ==================================================

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});


// ==================================================
// NORMAL AI CHAT
// ==================================================

app.post("/api/chat", async (req, res) => {

    try {

        const userMessage = req.body.message;

        if (!userMessage) {

            return res.status(400).json({
                reply: "Please enter a message."
            });

        }

        const response = await ai.models.generateContent({

            model: "gemini-3.6-flash",

            contents: userMessage

        });

        res.json({

            reply: response.text

        });

    } catch (error) {

        console.error(
            "Gemini Chat Error:",
            error
        );

        res.status(500).json({

            reply:
                "Sorry, I am unable to answer right now."

        });

    }

});


// ==================================================
// IMAGE UPLOAD CONFIGURATION
// ==================================================

const upload = multer({

    storage: multer.memoryStorage(),

    limits: {

        // Maximum image size = 10 MB
        fileSize: 10 * 1024 * 1024

    },

    fileFilter: (req, file, cb) => {

        // Only allow images
        if (
            file.mimetype &&
            file.mimetype.startsWith("image/")
        ) {

            cb(null, true);

        } else {

            cb(
                new Error(
                    "Only image files are allowed."
                )
            );

        }

    }

});


// ==================================================
// TRUTH TABLE IMAGE ANALYZER
// ==================================================

app.post(
    "/api/analyze-truth-table",
    upload.single("image"),

    async (req, res) => {

        try {

            // ------------------------------------------
            // Check whether image exists
            // ------------------------------------------

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    error:
                        "No image was uploaded."

                });

            }


            console.log("");
            console.log(
                "======================================"
            );
            console.log(
                "TRUTH TABLE IMAGE RECEIVED"
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
                Math.round(req.file.size / 1024),
                "KB"
            );
            console.log(
                "======================================"
            );


            // ------------------------------------------
            // Convert image to Base64
            // ------------------------------------------

            const imageBase64 =
                req.file.buffer.toString("base64");


            // ------------------------------------------
            // IMPORTANT:
            //
            // Gemini ONLY reads the table.
            //
            // Gemini does NOT calculate:
            // SOP
            // POS
            // Minterms
            // Maxterms
            // Simplification
            //
            // Your website will do those calculations.
            // ------------------------------------------

            const prompt = `

You are an image-reading assistant for a
Digital Electronics website.

Look ONLY at the uploaded image.

The image contains a Boolean truth table.

Your ONLY job is to READ the truth table.

Do NOT solve the Boolean algebra.

Do NOT calculate SOP.

Do NOT calculate POS.

Do NOT calculate minterms.

Do NOT calculate maxterms.

Do NOT simplify the Boolean expression.

Do NOT explain the table.

Return ONLY the information needed by the website.

Read:

1. The input variable names.
2. The output variable name.
3. Every visible truth-table row.
4. The value of every input.
5. The value of the output.

The order of the variables MUST match the
left-to-right order in the image.

For example, if the image contains:

A B X

0 0 1
0 1 0
1 0 0
1 1 0

return:

{
  "variables": ["A", "B"],
  "output": "X",
  "rows": [
    {
      "inputs": [0, 0],
      "output": 1
    },
    {
      "inputs": [0, 1],
      "output": 0
    },
    {
      "inputs": [1, 0],
      "output": 0
    },
    {
      "inputs": [1, 1],
      "output": 0
    }
  ],
  "confidence": "high",
  "notes": ""
}

RULES:

- Return ONLY valid JSON.
- Do NOT use Markdown.
- Do NOT use JSON code fences.
- Do NOT write an explanation.
- Do NOT guess unreadable values.
- If a value is unreadable, use "X".
- If there is a don't-care value in the image,
  preserve it as "X".
- Ignore watermarks.
- Ignore decorative text.
- Ignore surrounding webpage text.
- Read only the actual truth table.

The JSON must have exactly these fields:

variables
output
rows
confidence
notes

`;


            console.log(
                "Sending image to Gemini..."
            );


            // ------------------------------------------
            // Ask Gemini to extract the table
            // ------------------------------------------

            const response =
                await ai.models.generateContent({

                    model:
                        "gemini-3.6-flash",

                    contents: [

                        {
                            text: prompt
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

                    config: {

                        // We don't need deep reasoning
                        // for simply reading the table.
                        thinkingConfig: {

                            thinkingLevel:
                                "minimal"

                        }

                    }

                });


            // ------------------------------------------
            // Get Gemini response
            // ------------------------------------------

            const rawText =
                response.text.trim();


            console.log("");
            console.log(
                "GEMINI RESPONSE:"
            );
            console.log(
                rawText
            );
            console.log("");


            // ------------------------------------------
            // Remove accidental Markdown fences
            // ------------------------------------------

            let cleanedText =
                rawText
                    .replace(
                        /^```json\s*/i,
                        ""
                    )
                    .replace(
                        /^```\s*/i,
                        ""
                    )
                    .replace(
                        /\s*```$/i,
                        ""
                    )
                    .trim();


            // ------------------------------------------
            // Convert response to JSON
            // ------------------------------------------

            let tableData;

            try {

                tableData =
                    JSON.parse(
                        cleanedText
                    );

            } catch (jsonError) {

                console.error(
                    "JSON PARSE ERROR:"
                );

                console.error(
                    jsonError
                );

                console.error(
                    "Gemini returned:"
                );

                console.error(
                    cleanedText
                );


                return res.status(500).json({

                    success: false,

                    error:
                        "Gemini returned invalid table data.",

                    raw:
                        cleanedText

                });

            }


            // ------------------------------------------
            // Validate Gemini result
            // ------------------------------------------

            if (
                !Array.isArray(
                    tableData.variables
                )
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "Gemini did not return input variables.",

                    raw:
                        tableData

                });

            }


            if (
                !Array.isArray(
                    tableData.rows
                )
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "Gemini did not return truth-table rows.",

                    raw:
                        tableData

                });

            }


            if (
                tableData.variables.length === 0
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "No input variables were detected.",

                    raw:
                        tableData

                });

            }


            if (
                tableData.rows.length === 0
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "No truth-table rows were detected.",

                    raw:
                        tableData

                });

            }


            // ------------------------------------------
            // Log extracted information
            // ------------------------------------------

            console.log(
                "VARIABLES:"
            );

            console.log(
                tableData.variables
            );


            console.log(
                "OUTPUT:"
            );

            console.log(
                tableData.output
            );


            console.log(
                "ROWS:"
            );

            console.log(
                tableData.rows
            );


            console.log(
                "CONFIDENCE:"
            );

            console.log(
                tableData.confidence
            );


            console.log(
                "NOTES:"
            );

            console.log(
                tableData.notes
            );


            // ------------------------------------------
            // Send structured data to website
            // ------------------------------------------

            return res.json({

                success: true,

                variables:
                    tableData.variables,

                output:
                    tableData.output ||
                    "X",

                rows:
                    tableData.rows,

                confidence:
                    tableData.confidence ||
                    "unknown",

                notes:
                    tableData.notes ||
                    ""

            });


        } catch (error) {

            console.error("");
            console.error(
                "======================================"
            );
            console.error(
                "TRUTH TABLE ANALYSIS ERROR"
            );
            console.error(
                "======================================"
            );
            console.error(
                error
            );
            console.error(
                "======================================"
            );
            console.error("");


            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Unable to analyze the truth table image."

            });

        }

    }
);


// ==================================================
// MULTER / UPLOAD ERROR HANDLER
// ==================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "Upload error:",
            error
        );


        if (
            error instanceof multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Image is too large. Maximum size is 10 MB."

                });

            }


            return res.status(400).json({

                success: false,

                error:
                    "Image upload error: " +
                    error.message

            });

        }


        if (error) {

            return res.status(400).json({

                success: false,

                error:
                    error.message

            });

        }


        next();

    }
);


// ==================================================
// START SERVER
// ==================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});