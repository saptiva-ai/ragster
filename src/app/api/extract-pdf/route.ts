import {NextRequest, NextResponse} from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {execSync} from "child_process";

/**
 * API endpoint to extract text from PDF files
 * This uses a server-side approach for more reliable PDF parsing
 */
export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({error: "No file provided"}, {status: 400});
    }

    // Check if the file is a PDF
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        {error: "File is not a PDF document"},
        {status: 400},
      );
    }

    // Extract text from the PDF file
    const text = await extractTextFromPdf(file);

    return NextResponse.json({
      success: true,
      text,
      filename: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Unknown error"},
      {status: 500},
    );
  }
}

/**
 * Server-side function to extract text from PDF files
 */
async function extractTextFromPdf(file: File): Promise<string> {
  try {
    // Convert the file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `pdf-${Date.now()}.pdf`);

    // Write the buffer to the temporary file
    fs.writeFileSync(tempFilePath, buffer);

    // Process PDF with external libraries
    // We have several approaches we can try:

    // Option 1: Use pdf-parse if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);

      // Clean up the temporary file
      fs.unlinkSync(tempFilePath);

      // Get the text content
      return data.text;
    } catch (pdfParseError) {
      console.error("Error using pdf-parse:", pdfParseError);

      // Option 2: Try using pdf2json
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PDFParser = require("pdf2json");
        const parser = new PDFParser();

        const pdfData = await new Promise<{
          Pages?: Array<{
            Texts?: Array<{
              R?: Array<{
                T: string;
              }>;
            }>;
          }>;
        }>((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parser.on("pdfParser_dataReady", (data: any) => resolve(data));
          parser.on("pdfParser_dataError", (error: Error) => reject(error));
          parser.loadPDF(tempFilePath);
        });

        // Extract text from json format
        let text = "";
        if (pdfData && pdfData.Pages) {
          for (const page of pdfData.Pages) {
            if (page.Texts) {
              for (const textItem of page.Texts) {
                if (textItem.R) {
                  for (const r of textItem.R) {
                    text += decodeURIComponent(r.T) + " ";
                  }
                }
              }
              text += "\n\n"; // Add paragraph breaks between pages
            }
          }
        }

        // Clean up the temporary file
        fs.unlinkSync(tempFilePath);

        return text;
      } catch (pdf2jsonError) {
        console.error("Error using pdf2json:", pdf2jsonError);

        // Option 3: Use pdfjs-dist as a last resort
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

          // Set worker source path
          pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
            "pdfjs-dist/legacy/build/pdf.worker.js",
          );

          // Load the PDF file
          const loadingTask = pdfjsLib.getDocument({data: buffer});
          const pdf = await loadingTask.promise;

          let text = "";

          // Extract text from each page
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            // Join all the items and add a page break
            const pageText = content.items
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((item: any) => item.str)
              .join(" ");
            text += pageText + "\n\n";
          }

          // Clean up temporary file
          fs.unlinkSync(tempFilePath);

          return text;
        } catch (pdfjsError) {
          console.error("Error using pdfjs:", pdfjsError);

          // Final fallback: Try to use pdftotext if installed on the server
          try {
            const text = execSync(`pdftotext -layout "${tempFilePath}" -`, {
              encoding: "utf8",
              maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large files
            });

            // Clean up the temporary file
            fs.unlinkSync(tempFilePath);

            return text;
          } catch (pdftotextError) {
            console.error("Error using pdftotext:", pdftotextError);

            // Clean up temporary file before failing
            fs.unlinkSync(tempFilePath);

            throw new Error("All PDF parsing methods failed");
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in extractTextFromPdf:", error);
    return `Error extracting text from PDF: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}
