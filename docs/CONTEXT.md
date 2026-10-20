# Contexto da API

## Requisitos Funcionais e Não Funcionais

### 1. Requisitos Funcionais (RFs)

O que o sistema *precisa fazer* do ponto de vista do usuário final.

| ID | Descrição do Requisito |
| --- | --- |
| **RF01** | O sistema deve permitir o cadastro de um novo paciente (Nome, CPF, Telefone). |
| **RF02** | O sistema deve permitir a criação de um prontuário associado ao paciente com anotações clínicas em texto. |
| **RF03** | O sistema deve permitir o anexo de um arquivo de imagem (Radiografia) ou documento (PDF) de até 100MB vinculado ao prontuário. |
| **RF04** | O formulário no frontend deve processar o envio dos textos e do arquivo em uma única ação de submissão. |

### 2. Requisitos Não Funcionais (RNFs)

As restrições de arquitetura, performance e código que nós (engenharia) impomos.

| ID | Descrição do Requisito |
| --- | --- |
| **RNF01** | **(gRPC/Rede):** A transmissão do formulário deve usar *Client Streaming* com o padrão `oneof` no Protobuf, enviando os metadados (texto) no primeiro frame e os *chunks* do arquivo nos frames subsequentes. |
| **RNF02** | **(Memória/I-O):** O NestJS não pode carregar o arquivo inteiro na memória RAM. Os *chunks* recebidos devem ser repassados diretamente para o disco usando `fs.createWriteStream` (Non-blocking I/O). |
| **RNF03** | **(Persistência):** O banco de dados (PostgreSQL) armazenará apenas os dados estruturados e o *caminho físico* (path) do arquivo, nunca o binário (BLOB). |
| **RNF04** | **(Padrão de Código):** Nomes de funções operacionais (ex: `streamExamToDisk`, `saveClinicalRecord`) devem ser estritamente em inglês. Operações no banco não usarão ORMs pesados para *queries* complexas. |

---

### 3. Modelagem de Entidades (PostgreSQL)

Para suportar esse fluxo, começaremos criando três tabelas principais no nosso banco relacional.

1. **`patients`**: A entidade raiz.
* `id` (UUID, Primary Key)
* `full_name` (Varchar)
* `document_cpf` (Varchar, Unique)
* `created_at` (Timestamp)


2. **`clinical_records`**: O prontuário/consulta específica.
* `id` (UUID, Primary Key)
* `patient_id` (UUID, Foreign Key)
* `doctor_notes` (Text)
* `created_at` (Timestamp)


3. **`medical_files`**: O registro do arquivo físico no banco.
* `id` (UUID, Primary Key)
* `record_id` (UUID, Foreign Key)
* `original_name` (Varchar)
* `mime_type` (Varchar - ex: "image/png")
* `disk_path` (Varchar - ex: "/var/plexus/storage/exams/uuid.png")
* `size_bytes` (BigInt)

### 4. O Fluxo de Execução (Under the Hood)

Quando o usuário clicar em "Salvar" no Next.js, este será o ciclo de vida exato da requisição na nossa arquitetura:

1. **Leitura no Next.js (Server Action):** O Server Action do Next.js intercepta o `FormData`. Ele separa as strings (nome, CPF, notas) do objeto `File`.
2. **Abertura do Stream gRPC:** O cliente gRPC do Next.js abre um canal bidirecional (ou client streaming) com o NestJS.
3. **Envio do Pacote 1 (Metadados):** O Next.js envia o objeto estruturado contendo os dados do paciente e do prontuário.
4. **Setup no NestJS:** O backend recebe o Pacote 1. Ele executa as *queries* INSERT na tabela `patients` e `clinical_records` e gera o registro na tabela `medical_files` com status "uploading". Em seguida, abre o `WriteStream` no File System local com o caminho de destino.
5. **Streaming de Bytes:** O Next.js começa a ler o `File` da memória e a enviar mensagens gRPC contendo apenas *arrays* de bytes (ex: chunks de 64KB). O NestJS recebe e imediatamente os joga no `WriteStream` do disco.
6. **Finalização:** Quando o arquivo acaba, o Next.js emite um sinal de encerramento (`end()`). O NestJS fecha o arquivo no disco, atualiza o status no banco de dados e retorna o `response` de sucesso.