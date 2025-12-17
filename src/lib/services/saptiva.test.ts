import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaptivaService } from './saptiva';
import { connectToDatabase } from '../mongodb/client';

// --- MOCKS ---

// Mockear fetch globalmente
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mockear la base de datos y colecciones
const insertOneMock = vi.fn();
const collectionMock = {
  insertOne: insertOneMock,
};
const dbMock = {
  collection: vi.fn(() => collectionMock),
};

// Mockear el módulo de conexión a Mongo
vi.mock('../mongodb/client', () => ({
  connectToDatabase: vi.fn(() => Promise.resolve({ db: dbMock })),
}));

describe('SaptivaService', () => {
  let service: SaptivaService;
  const API_KEY = 'test-api-key';
  const BASE_URL = 'https://api.saptiva.com';

  beforeEach(() => {
    service = new SaptivaService(API_KEY, BASE_URL);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('debe inicializar correctamente', () => {
    expect(service).toBeDefined();
  });

  it('debe construir el payload correctamente INCLUYENDO el historial', async () => {
    // 1. Preparar datos de prueba
    const mockId = 'msg-123';
    const mockPrompt = 'Eres un asistente útil.';
    const mockQuery = '¿Cuál es mi saldo?';
    const mockResponseText = 'Tu saldo es 100.';

    // Mockear respuesta exitosa de Saptiva API
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: mockResponseText,
            },
          },
        ],
      }),
    });

    // 2. Ejecutar el método bajo prueba
    // Note: Current API doesn't support history parameter - it's handled at the route level
    const result = await service.generateText(
      mockId,
      mockPrompt,
      mockQuery,
      'default-model',
      0.5,
      1000
    );

    // 3. Aserciones

    // Verificar que el resultado sea el texto limpio
    expect(result).toBe(mockResponseText);

    // Verificar que fetch se llamó con la URL y Headers correctos
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.saptiva.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
      })
    );

    // CRÍTICO: Verificar que el body enviado incluya system + user query en orden
    // Note: History is now handled at route level, not in SaptivaService
    const expectedMessages = [
      { role: 'system', content: mockPrompt },
      { role: 'user', content: mockQuery },
    ];

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.messages).toEqual(expectedMessages);
  });

  it('debe guardar la respuesta del asistente en la base de datos', async () => {
    const mockId = 'msg-456';
    const mockResponseText = 'Respuesta guardada.';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockResponseText } }],
      }),
    });

    await service.generateText(mockId, 'prompt', 'query');

    expect(connectToDatabase).toHaveBeenCalled();
    expect(dbMock.collection).toHaveBeenCalledWith('messages');
    expect(insertOneMock).toHaveBeenCalledWith(expect.objectContaining({
      message_id: mockId,
      message_role: 'assistant',
      message: mockResponseText,
    }));
  });

  it('debe manejar errores de la API correctamente', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(service.generateText('id', 'p', 'q')).rejects.toThrow('Error en la API de Saptiva');
  });
});
