export interface WeaviateRecord {
  id: string;
  class: string;
  properties: Record<string, string | number | boolean | null>;
  vector?: number[];
}

export async function getWeaviateRecords(): Promise<WeaviateRecord[]> {
  try {
    const response = await fetch("/api/records-weaviate");
    if (!response.ok) {
      throw new Error("Error fetching records");
    }
    const data = await response.json();
    return data.records.map(
      (item: {
        id: string;
        properties: Record<string, string | number | boolean | null>;
      }) => ({
        id: item.id,
        class: "DocumentChunk",
        properties: item.properties,
      }),
    );
  } catch (error) {
    console.error("Error fetching Weaviate records:", error);
    throw error;
  }
}

export async function updateWeaviateRecord(
  id: string,
  properties: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    const response = await fetch("/api/records-weaviate", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({id, properties}),
    });
    if (!response.ok) {
      throw new Error("Error updating record");
    }
  } catch (error) {
    console.error("Error updating Weaviate record:", error);
    throw error;
  }
}

export async function deleteWeaviateRecord(id: string): Promise<void> {
  try {
    const response = await fetch("/api/records-weaviate", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({id}),
    });
    if (!response.ok) {
      throw new Error("Error deleting record");
    }
  } catch (error) {
    console.error("Error deleting Weaviate record:", error);
    throw error;
  }
}
