import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import mongoClientPromise from '@/app/lib/mongodb';
import { TaskType } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log("Starting vector search...");
    const client = await mongoClientPromise;
    console.log("MongoDB client connected");

    const dbName = "docs";
    const collectionName = "embeddings";
    const collection = client.db(dbName).collection(collectionName);
    console.log(`Using database: ${dbName}, collection: ${collectionName}`);

    // Check if the text index exists and create it if not
    const indexes = await collection.listIndexes().toArray();
    const textIndexExists = indexes.some((index: any) => index.key && index.key.text === "text");

    if (!textIndexExists) {
      console.log("Creating text index on 'text' field...");
      await collection.createIndex({ text: "text" });
      console.log("Text index created.");
    }

    let question: string;
    const contentType = req.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      const body = await req.json();
      question = body.question;
    } else {
      question = await req.text();
    }

    if (!question) {
      console.log("No question provided");
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    console.log("Received question:", question);

    const vectorStore = new MongoDBAtlasVectorSearch(
      new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        model: "embedding-001",
        taskType: TaskType.RETRIEVAL_DOCUMENT
      }), {
      collection,
      indexName: "default",
      textKey: "text", 
      embeddingKey: "embedding",
    });
    console.log("Vector store initialized");

    const retriever = vectorStore.asRetriever({
      searchType: "mmr",
      searchKwargs: {
        fetchK: 20,
        lambda: 0.1,
      },
    });
    console.log("Retriever created");

    console.log("Invoking retriever...");
    const retrieverOutput = await retriever.invoke(question);
    console.log("Retriever output:", JSON.stringify(retrieverOutput, null, 2));

    const formattedOutput = retrieverOutput.map(doc => ({
      text: doc.pageContent,
      metadata: doc.metadata
    }));

    console.log("Formatted output:", JSON.stringify(formattedOutput, null, 2));

    // Perform a simple text search to check if documents exist
    const textSearchResult = await collection.findMany({ $text: { $search: question } });
    console.log("Text search result:", JSON.stringify(textSearchResult, null, 2));

    // Check the embedding
    try {
      const embedding = await new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        model: "embedding-001",
        taskType: TaskType.RETRIEVAL_DOCUMENT
      }).embedQuery(question);
      console.log("Embedding generated successfully. First 5 values:", embedding.slice(0, 5));
    } catch (error) {
      console.error("Error generating embedding:", error);
    }

    return NextResponse.json({ results: formattedOutput });
  } catch (error: unknown) {
    console.error('Error:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'An error occurred during the search', details: error.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: 'An unknown error occurred during the search' }, { status: 500 });
    }
  }
}
