import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { connectToDatabase } from "@/lib/mongodb/client";

export async function GET() {
  const { db } = await connectToDatabase();
  const messages = await db.collection("messages").find({}).sort({ timestamp: 1 }).toArray();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mensajes");

  sheet.columns = [
    { header: "ID Mensaje", key: "message_id", width: 20 },
    { header: "Contacto", key: "contact_name", width: 25 },
    { header: "Rol", key: "message_role", width: 12 },
    { header: "Mensaje", key: "message", width: 60 },
    { header: "Fecha", key: "timestamp", width: 25 },
  ];

  // Estilos de cabecera
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE3F2FD" }, // Azul claro
    };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
    };
  });

  // Rellenar filas
  messages.forEach((msg) => {
    sheet.addRow({
      message_id: msg.message_id,
      contact_name: msg.contact_name ?? "",
      message_role: msg.message_role,
      message: msg.message,
      timestamp: msg.timestamp?.toISOString() ?? "",
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `mensajes_wa_${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-")}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
