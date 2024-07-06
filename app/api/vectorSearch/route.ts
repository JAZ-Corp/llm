import { GoogleVertexAIEmbeddings } from "@langchain/community/embeddings/googlevertexai";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import mongoClientPromise from '@/app/lib/mongodb';

export async function POST(req: Request) {
  const client = await mongoClientPromise;
  const dbName = "docs";
  const collectionName = "embeddings";
  const collection = client.db(dbName).collection(collectionName);
  
  const question = await req.text();

  const vectorStore = new MongoDBAtlasVectorSearch(
    new GoogleVertexAIEmbeddings(), 
    {
    collection,
    indexName: "default",
    textKey: "text", 
    embeddingKey: "embedding",
  });

  const retriever = vectorStore.asRetriever({
    searchType: "mmr",
    searchKwargs: {
      fetchK: 20,
      lambda: 0.1,
    },
  });
  
  const retrieverOutput = await retriever.getRelevantDocuments(question);
  
  return Response.json(retrieverOutput);
}