import axios from "axios";
import express from "express";
import cheerio from "cheerio";
import openai from "openai";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import keywords from "./files/categoriesKeywords.json" assert { type: "json" };
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Now, you can access the API key using process.env.OPENAI_API_KEY
const openaiInstance = new openai({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pagePath = path.join(__dirname, "./public/index.html");
app.use(express.static("public"));
app.get("/", (req, res) => res.sendFile(pagePath));
app.post("/categorize", async (req, res) => {
  let url = req.body.url;

  if (!url.includes("http://") && !url.includes("https://")) {
    url = "https://www." + url;
  }
  console.log("Received URL:", url); // Add this line for debugging

  if (!url) {
    return res.status(400).json({ error: "No URL provided." });
  }

  try {
    const result = await main(url);
    res.json(result);
  } catch (error) {
    console.error("Error categorizing website:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

function getKeywordsFromFile() {
  const filePath = path.join(__dirname, "./files/words.txt");
  const data = fs.readFileSync(filePath, "utf8");
  return data.split("\n");
}

function readPromptFromFile() {
  const filePath = path.join(__dirname, "./files/prompt.json");
  const data = fs.readFileSync(filePath, "utf8");
  const promptData = JSON.parse(data);
  return promptData.prompt;
}

const fileKeywords = getKeywordsFromFile();

async function extractTextFromURL(url) {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    };

    const response = await axios.get(url, { headers });
    const html = response.data;
    const $ = cheerio.load(html);

    const allowedTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "span"];
    const extractedTexts = allowedTags.map((tag) => $(tag).text());

    const joinedText = extractedTexts.join(" ");
    const trimmedText = joinedText.replace(/\s+/g, " ").trim();

    console.log("Extracted text:", trimmedText);
    return trimmedText;
  } catch (error) {
    console.error("Error extracting text from website:", error);
    return "";
  }
}

function categorizeWebsite(text) {
  const categoryCounts = {};

  for (const category in keywords) {
    const categoryKeywords = keywords[category];
    const matchedKeywords = categoryKeywords.filter((keyword) =>
      text.includes(keyword)
    );
    if (matchedKeywords.length >= 3) {
      categoryCounts[category] = matchedKeywords.length;
    }
  }

  if (Object.keys(categoryCounts).length > 0) {
    const bestCategory = Object.keys(categoryCounts).reduce((a, b) =>
      categoryCounts[a] > categoryCounts[b] ? a : b
    );
    return bestCategory;
  }

  return null;
}

function updatePromptTemplate(url, content) {
  let prompt = readPromptFromFile();
  prompt = prompt.replace("{{url}}", url).replace("{{content}}", content);
  return prompt;
}
// use the updated prompt

async function generateOpenAIResponse(text) {
  try {
    console.log("The text sent to OpenAI: ", text);
    const response = await openaiInstance.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: text }],
    });

    let responseText = "";
    if (
      response.choices &&
      response.choices[0] &&
      response.choices[0].message
    ) {
      responseText = response.choices[0].message.content;
    }

    return responseText;
  } catch (error) {
    console.error("Error generating OpenAI response:", error);
    return "Error generating response.";
  }
}

async function main(url) {
  const extractedText = await extractTextFromURL(url);
  const category = categorizeWebsite(extractedText);
  let result;

  if (category) {
    console.log(`Website categorized as: ${category}`);
    const matchedKeywords = keywords[category].filter((keyword) =>
      extractedText.includes(keyword)
    );
    result = {
      url,
      category,
      matchedKeywords,
    };
  } else {
    const updatedPrompt = updatePromptTemplate(url, extractedText);
    const openaiResponse = await generateOpenAIResponse(updatedPrompt);
    // pack the result to return
    result = {
      url,
      category: "Unable to categorize. OpenAI Response: ",
      openaiResponse,
    };
    console.log(result.category, openaiResponse);
  }
  return result; // returns the result
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
