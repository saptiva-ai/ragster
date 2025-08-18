// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLocaleCodes(): Promise<any> {
  try {
    const localeCodes = [
      {
        key: "en",
        language: "English",
        country: "United States",
        code: "en_US",
      },
      {
        key: "en_US",
        language: "English",
        country: "United States",
        code: "en_US",
      },
      {
        key: "en_GB",
        language: "English",
        country: "United Kingdom",
        code: "en_GB",
      },
      {
        key: "en_AU",
        language: "English",
        country: "Australia",
        code: "en_AU",
      },
      {key: "en_CA", language: "English", country: "Canada", code: "en_CA"},
      {key: "en_IN", language: "English", country: "India", code: "en_IN"},
      {key: "fr_FR", language: "French", country: "France", code: "fr_FR"},
      {key: "fr_CA", language: "French", country: "Canada", code: "fr_CA"},
      {key: "fr_BE", language: "French", country: "Belgium", code: "fr_BE"},
      {
        key: "fr_CH",
        language: "French",
        country: "Switzerland",
        code: "fr_CH",
      },
      {key: "es_ES", language: "Spanish", country: "Spain", code: "es_ES"},
      {key: "es", language: "Spanish", country: "Mexico", code: "es_MX"},
      {key: "es_MX", language: "Spanish", country: "Mexico", code: "es_MX"},
      {
        key: "es_AR",
        language: "Spanish",
        country: "Argentina",
        code: "es_AR",
      },
      {
        key: "es_US",
        language: "Spanish",
        country: "United States",
        code: "es_US",
      },
      {key: "de_DE", language: "German", country: "Germany", code: "de_DE"},
      {key: "de_AT", language: "German", country: "Austria", code: "de_AT"},
      {
        key: "de_CH",
        language: "German",
        country: "Switzerland",
        code: "de_CH",
      },
      {key: "it_IT", language: "Italian", country: "Italy", code: "it_IT"},
      {
        key: "it_CH",
        language: "Italian",
        country: "Switzerland",
        code: "it_CH",
      },
      {
        key: "pt_PT",
        language: "Portuguese",
        country: "Portugal",
        code: "pt_PT",
      },
      {
        key: "pt_BR",
        language: "Portuguese",
        country: "Brazil",
        code: "pt_BR",
      },
      {
        key: "zh_CN",
        language: "Chinese",
        country: "Simplified (China)",
        code: "zh_CN",
      },
      {
        key: "zh_TW",
        language: "Chinese",
        country: "Traditional (Taiwan)",
        code: "zh_TW",
      },
      {
        key: "zh_HK",
        language: "Chinese",
        country: "Traditional (Hong Kong)",
        code: "zh_HK",
      },
      {key: "ja_JP", language: "Japanese", country: "Japan", code: "ja_JP"},
      {
        key: "ko_KR",
        language: "Korean",
        country: "South Korea",
        code: "ko_KR",
      },
      {key: "ru_RU", language: "Russian", country: "Russia", code: "ru_RU"},
      {
        key: "ar_SA",
        language: "Arabic",
        country: "Arabic (Saudi Arabia)",
        code: "ar_SA",
      },
      {
        key: "ar_EG",
        language: "Arabic",
        country: "Arabic (Egypt)",
        code: "ar_EG",
      },
      {key: "hi_IN", language: "Hindi", country: "India", code: "hi_IN"},
      {
        key: "bn_BD",
        language: "Bengali",
        country: "Bangladesh",
        code: "bn_BD",
      },
      {key: "bn_IN", language: "Bengali", country: "India", code: "bn_IN"},
      {key: "ur_PK", language: "Urdu", country: "Pakistan", code: "ur_PK"},
      {key: "ur_IN", language: "Urdu", country: "India", code: "ur_IN"},
      {key: "tr_TR", language: "Turkish", country: "Turkey", code: "tr_TR"},
      {
        key: "nl_NL",
        language: "Dutch",
        country: "Netherlands",
        code: "nl_NL",
      },
      {key: "nl_BE", language: "Dutch", country: "Belgium", code: "nl_BE"},
      {key: "sv_SE", language: "Swedish", country: "Sweden", code: "sv_SE"},
      {
        key: "no_NO",
        language: "Norwegian",
        country: "Norway",
        code: "no_NO",
      },
      {key: "da_DK", language: "Danish", country: "Denmark", code: "da_DK"},
      {
        key: "fi_FI",
        language: "Finnish",
        country: "Finland",
        code: "fi_FI",
      },
    ];

    return localeCodes;
  } catch (error) {
    console.error("Error al obtener los códigos de localización:", error);
    throw error;
  }
}
