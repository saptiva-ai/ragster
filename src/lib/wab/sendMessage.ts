import {messageType} from "./messageType";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendMessageToWABA(params: any): Promise<any> {
  const {data, settings} = params;

  console.log("Recibida solicitud para enviar mensaje:", data, settings);
  try {
    if (data.message) {
      if (data.message.length > 4096) {
        return {
          error: true,
          code: 306,
          message: "The maximum message limit is 4096 characters.",
        };
      }
    }

    const body = await messageType(data);

    console.log("Cuerpo del mensaje:", body);

    if (body.error) {
      return body;
    }

    if (!process.env.URL_META) {
      return {
        error: true,
        code: 500,
        message: "Environment variable URL_META is not defined.",
      };
    }

    let response = await fetch(
      `${process.env.URL_META}/${settings.data.phoneNumberId}/messages`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.data.accessToken}`,
        },
        method: "POST",
        body,
      },
    )
      .then((res) => {
        return res.text();
      })
      .catch((e) => {
        return {
          error: true,
          code: 500,
          message: e,
        };
      });

    console.log("Respuesta de WABA:", response);

    if (typeof response === "string") {
      response = JSON.parse(response);
    }

    return {
      error: false,
      code: 200,
      message: response,
    };
  } catch (error) {
    return {
      error: true,
      code: 500,
      message: error,
    };
  }
}
