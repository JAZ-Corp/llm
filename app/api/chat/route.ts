import { StreamingTextResponse, LangChainStream, Message } from 'ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const currentMessageContent = messages[messages.length - 1].content;

  console.log("Sending request to vectorSearch API");
  const vectorSearch = await fetch("http://localhost:3000/api/vectorSearch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: currentMessageContent }),
  }).then((res) => res.json());
  console.log("Received response from vectorSearch API:", vectorSearch);

  const contextSections = vectorSearch.results ? vectorSearch.results.map((result: any) => result.text).join('\n\n') : '';

  console.log("Context sections:", contextSections);

  let TEMPLATE;

  if (contextSections) {
    TEMPLATE = `You are a very enthusiastic freeCodeCamp.org representative who loves to help people! Given the following sections from the freeCodeCamp.org contributor documentation, answer the question using only that information, outputted in markdown format. If you are unsure and the answer is not explicitly written in the documentation, say "Sorry, I don't know how to help with that."

    Context sections:
    ${contextSections}

    Question: """
    ${currentMessageContent}
    """
    `;
  } else {
    TEMPLATE = `You are a very enthusiastic freeCodeCamp.org representative who loves to help people! Please answer the following question to the best of your ability, outputted in markdown format:

    Question: """
    ${currentMessageContent}
    """
    `;
  }

  messages[messages.length - 1].content = TEMPLATE;

  const { stream, handlers } = LangChainStream();

  const llm = new ChatGoogleGenerativeAI({
    modelName: "gemini-pro",
    streaming: true,
  });

  const chainedMessages = (messages as Message[]).map(m =>
    m.role === 'user'
      ? new HumanMessage(m.content)
      : new AIMessage(m.content)
  );

  llm
    .invoke(chainedMessages, { callbacks: [handlers] })
    .catch(console.error);

  return new StreamingTextResponse(stream);
}
