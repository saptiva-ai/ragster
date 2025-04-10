import {NextRequest, NextResponse} from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {execSync} from "child_process";

/**
 * API endpoint to extract text from DOCX files
 * This uses a server-side approach for more reliable DOCX parsing
 */
export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({error: "No file provided"}, {status: 400});
    }

    // Check if the file is a DOCX
    if (
      file.type !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return NextResponse.json(
        {error: "File is not a DOCX document"},
        {status: 400},
      );
    }

    // Extract text from the DOCX file
    const text = await extractTextFromDocx(file);

    return NextResponse.json({
      success: true,
      text,
      filename: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error("Error extracting text from DOCX:", error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Unknown error"},
      {status: 500},
    );
  }
}

/**
 * Server-side function to extract text from DOCX files
 */
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    // Convert the file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `docx-${Date.now()}.docx`);

    // Write the buffer to the temporary file
    fs.writeFileSync(tempFilePath, buffer);

    // Process DOCX with external libraries
    // We have two approaches we can try:

    // Option 1: Use mammoth.js if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({path: tempFilePath});

      // Clean up the temporary file
      fs.unlinkSync(tempFilePath);

      return result.value;
    } catch (mammothError) {
      console.error("Error using mammoth.js:", mammothError);

      // Option 2: Try using a simple docx library
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const {DocxParser} = require("docx-parser");
        const parser = new DocxParser();
        const text = parser.parseDocx(tempFilePath);

        // Clean up the temporary file
        fs.unlinkSync(tempFilePath);

        return text;
      } catch (docxParserError) {
        console.error("Error using docx-parser:", docxParserError);

        // Option 3: Try using a simpler XML extraction approach
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const AdmZip = require("adm-zip");
          const zip = new AdmZip(tempFilePath);
          const contentXml = zip.getEntry("word/document.xml");

          if (!contentXml) {
            throw new Error("Could not find document.xml in the DOCX file");
          }

          const content = contentXml.getData().toString("utf8");

          // Extract text using regex from XML
          // This is not ideal but can work as a last resort
          const textContent = content
            .replace(/<[^>]+>/g, " ") // Remove XML tags
            .replace(/\s+/g, " ") // Normalize whitespace
            .trim();

          // Clean up the temporary file
          fs.unlinkSync(tempFilePath);

          return textContent;
        } catch (zipError) {
          console.error("Error using adm-zip:", zipError);

          // Final fallback: Try to use pandoc if installed on the server
          try {
            const text = execSync(`pandoc -f docx -t plain ${tempFilePath}`, {
              encoding: "utf8",
              maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large files
            });

            // Clean up the temporary file
            fs.unlinkSync(tempFilePath);

            return text;
          } catch (pandocError) {
            console.error("Error using pandoc:", pandocError);

            // Clean up temporary file before failing
            fs.unlinkSync(tempFilePath);

            throw new Error("All DOCX parsing methods failed");
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in extractTextFromDocx:", error);
    return `Error extracting text from document: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}
