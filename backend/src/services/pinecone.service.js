
import { pc } from "../config/pinecone.js";

export const index = pc.index(process.env.PINECONE_INDEX_NAME || "recipes");
