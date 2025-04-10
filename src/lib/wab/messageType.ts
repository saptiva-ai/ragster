import {getLocaleCodes} from "./localeCodes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function messageType(data: any): Promise<any> {
  const typeMessage = data.type || "text";
  const parameters: Array<{type: string; text: string}> = [];

  const params: {
    messaging_product: string;
    recipient_type: string;
    to: string;
    type: string;
    image?: {link: string};
    document?: {link: string; caption?: string};
    audio?: {link: string};
    video?: {link: string};
    sticker?: {link: string};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contacts?: any[];
    location?: {
      longitude: string;
      latitude: string;
      name: string;
      address: string;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interactive?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    template?: any;
    text?: {preview_url: string; body: string};
  } = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: data.to,
    type: typeMessage,
  };

  try {
    switch (typeMessage) {
      case "image":
        if (!data.url) {
          return {
            error: true,
            code: 310,
            message: "URL field must be specified to send WAB message",
          };
        }

        params.image = {
          link: data.url,
        };

        break;
      case "file":
        if (!data.url) {
          return {
            error: true,
            code: 310,
            message: "URL field must be specified to send WAB message",
          };
        }

        params.type = "document";
        params.document = {
          link: data.url,
          caption: data.filename || "",
        };

        break;
      case "audio":
        if (!data.url) {
          return {
            error: true,
            code: 310,
            message: "URL field must be specified to send WAB message",
          };
        }

        params.audio = {
          link: data.url,
        };

        break;
      case "video":
        if (!data.url) {
          return {
            error: true,
            code: 310,
            message: "URL field must be specified to send WAB message",
          };
        }

        params.video = {
          link: data.url,
        };

        break;
      case "sticker":
        if (!data.url) {
          return {
            error: true,
            code: 310,
            message: "URL field must be specified to send WAB message",
          };
        }

        params.sticker = {
          link: data.url,
        };

        break;
      case "contact":
        if (!data.contact) {
          return {
            error: true,
            code: 314,
            message: "Contacs field must be specified to send WAB message",
          };
        }

        params.type = "contacts";
        params.contacts = [data.contact];

        break;
      case "location":
        if (!data.longitude) {
          return {
            error: true,
            code: 312,
            message: "Longitude field must be specified to send WAB message",
          };
        }
        if (!data.latitude) {
          return {
            error: true,
            code: 313,
            message: "Latitude field must be specified to send WAB message",
          };
        }
        if (!data.name) {
          return {
            error: true,
            code: 313,
            message: "Name field must be specified to send WAB message",
          };
        }
        if (!data.address) {
          return {
            error: true,
            code: 313,
            message: "Address field must be specified to send WAB message",
          };
        }

        params.location = {
          longitude: data.longitude,
          latitude: data.latitude,
          name: data.name,
          address: data.address,
        };

        break;
      case "list":
        if (!data.body) {
          return {
            error: true,
            code: 310,
            message: "Body field must be specified to send WAB message",
          };
        }
        if (!data.action) {
          return {
            error: true,
            code: 310,
            message: "Action field must be specified to send WAB message",
          };
        }
        if (!data.action.title) {
          return {
            error: true,
            code: 310,
            message:
              "Action: Title field must be specified to send WAB message",
          };
        }
        if (!data.action.sections) {
          return {
            error: true,
            code: 310,
            message:
              "Action: Sections field must be specified to send WAB message",
          };
        }

        params.type = "interactive";
        params.interactive = {
          type: "list",
          body: data.body,
          action: {
            button: data.action.title,
            sections: data.action.sections,
          },
        };

        if (data.header) {
          if (!data.header.type) {
            return {
              error: true,
              code: 310,
              message:
                "Header: Type field must be specified to send WAB message",
            };
          }

          if (!data.header.text) {
            return {
              error: true,
              code: 310,
              message:
                "Header: Text field must be specified to send WAB message",
            };
          }

          params.interactive.header = data.header;
        }

        if (data.footer) {
          if (!data.footer.text) {
            return {
              error: true,
              code: 310,
              message:
                "Footer: Text field must be specified to send WAB message",
            };
          }

          params.interactive.footer = data.footer;
        }

        break;
      case "buttons":
        if (!data.body) {
          return {
            error: true,
            code: 310,
            message: "Body field must be specified to send WAB message",
          };
        }

        if (!data.action) {
          return {
            error: true,
            code: 310,
            message: "Action field must be specified to send WAB message",
          };
        }

        const buttons: Array<{
          type: string;
          reply: {id: string; title: string};
        }> = [];

        data.action.buttons.forEach(
          (button: {type: string; id: string; title: string}) => {
            buttons.push({
              type: button.type,
              reply: {
                id: button.id,
                title: button.title,
              },
            });
          },
        );

        params.type = "interactive";
        params.interactive = {
          type: "button",
          body: data.body,
          action: {
            buttons,
          },
        };

        if (data.footer) {
          if (!data.footer.text) {
            return {
              error: true,
              code: 310,
              message:
                "Footer: Text field must be specified to send WAB message",
            };
          }

          params.interactive.footer = data.footer;
        }
        break;
      case "template":
        if (!data.templateName) {
          return {
            error: true,
            code: 310,
            message:
              "Template name field must be specified to send WAB message",
          };
        }
        if (!data.templateData) {
          return {
            error: true,
            code: 310,
            message:
              "Template data field must be specified to send WAB message",
          };
        }
        if (!data.language) {
          return {
            error: true,
            code: 310,
            message: "Language field must be specified to send WAB message",
          };
        }
        if (!data.templateData.body) {
          return {
            error: true,
            code: 310,
            message:
              "Template data: Body field must be specified to send WAB message",
          };
        }

        const localeCodes = await getLocaleCodes();
        const foundLocale = localeCodes.find(
          (locale: {key: string; code: string}) => locale.key === data.language,
        );

        if (!foundLocale) {
          return {
            error: true,
            code: 310,
            message: "Language code not found",
          };
        }

        params.template = {
          name: data.templateName,
          language: {
            code: foundLocale.code,
          },
          components: [],
        };

        data.templateData.body.placeholders.forEach((parameter: string) => {
          parameters.push({
            type: "text",
            text: parameter,
          });
        });

        if (data.templateData.body) {
          params.template.components.push({
            type: "body",
            parameters: parameters,
          });
        }

        if (data.templateData?.header) {
          switch (data.templateData.header.type) {
            case "IMAGE":
              params.template.components.push({
                type: "header",
                parameters: [
                  {
                    type: "image",
                    image: {
                      link: data.templateData.header.mediaUrl,
                    },
                  },
                ],
              });
              break;
            case "VIDEO":
              params.template.components.push({
                type: "header",
                parameters: [
                  {
                    type: "video",
                    video: {
                      link: data.templateData.header.mediaUrl,
                    },
                  },
                ],
              });

              break;
            case "DOCUMENT":
              params.template.components.push({
                type: "header",
                parameters: [
                  {
                    type: "document",
                    document: {
                      link: data.templateData.header.mediaUrl,
                    },
                    filename: data.templateData.header.filename,
                  },
                ],
              });
              break;
            case "LOCATION":
              params.template.components.push({
                type: "header",
                parameters: [
                  {
                    type: "location",
                    location: data.location,
                  },
                ],
              });
              break;
            default:
              break;
          }
        }

        if (data.url) {
          switch (data.mimetype.split("/")[0]) {
            case "application":
              params.template.components.push({
                type: "header",
                parameters: [
                  {
                    type: "document",
                    document: {
                      link: data.url,
                    },
                    filename: data.filename || "",
                  },
                ],
              });

              break;
            case "image":
              params.template.components.push({
                type: "header",
                parameters: [
                  {
                    type: "image",
                    image: {
                      link: data.url,
                    },
                  },
                ],
              });
              break;
            case "video":
              params.template.components.push({
                type: "header",
                parameters: [
                  {
                    type: "video",
                    video: {
                      link: data.url,
                    },
                  },
                ],
              });
              break;
            default:
              break;
          }
        }
        break;
      default:
        if (!data.message) {
          return {
            error: true,
            code: 303,
            message: "Message field must be specified to send WAB message",
          };
        }

        params.text = {
          preview_url: data.previewUrl || "false",
          body: data.message,
        };
        console.log("params.text", params.text);

        break;
    }

    return JSON.stringify(params);
  } catch (error) {
    return {
      error: true,
      code: 500,
      message: error,
    };
  }
}
