import axios from "axios";
import express from "express";
import cheerio from "cheerio";
import openai from "openai";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
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
  console.log("Received URL:", url);

  if (!url) {
    return res.status(400).json({ error: "No URL provided." });
  }

  try {
    const result = await main(url);
    const finalResponse = JSON.parse(result.finalOpenAIResponse);
    res.json(finalResponse);
  } catch (error) {
    console.error("Error categorizing website:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

function getKeywordsFromFile() {
  const filePath = path.join(__dirname, "./files/keywords.json");
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data);
}

function readPromptFromFile() {
  const filePath = path.join(__dirname, "./files/prompt.json");
  const data = fs.readFileSync(filePath, "utf8");
  const promptData = JSON.parse(data);
  return promptData.prompt;
}

function readCategoriesFromFile() {
  const filePath = path.join(__dirname, "./files/Categories.json");
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data);
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
    let extractedTexts = [];
    allowedTags.forEach((tag) => {
      $(tag).each((i, el) => {
        extractedTexts.push($(el).text());
      });
    });

    const joinedText = extractedTexts.join(" ");
    const trimmedText = joinedText.replace(/\s+/g, " ").trim();
    console.log("Extracted text:", trimmedText);
    const matchedKeywords = fileKeywords.filter((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      return regex.test(trimmedText);
    });
    console.log("Matched keywords:", matchedKeywords);
    return { text: trimmedText, matchedKeywords };
  } catch (error) {
    if (error.code === "CERT_HAS_EXPIRED") {
      console.error("Error extracting text from website");
      return { text: "", matchedKeywords: [] }; // Return an empty string and empty array
    } else {
      console.error("Error extracting text from website:", error);
      throw error; // Re-throw the error if it's not the "certificate has expired" error
    }
  }
}

function countKeywords(text, keywords) {
  const wordArray = text.split(" ");
  const keywordCounts = {};

  keywords.forEach((keyword) => {
    const count = wordArray.reduce((total, word) => {
      return total + (word.toLowerCase() === keyword.toLowerCase() ? 1 : 0);
    }, 0);

    if (count > 1) {
      keywordCounts[keyword] = count;
    }
  });

  return keywordCounts;
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

async function generateOpenAIResponseforwebsitePrompt(text) {
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

    console.log("OpenAI Response for website prompt: ", responseText);
    return responseText;
  } catch (error) {
    console.error("Error generating OpenAI response:", error);
    return "Error generating response.";
  }
}

function readWebsitePromptFromFile() {
  const filePath = path.join(__dirname, "./files/websitePrompt.json");
  const data = fs.readFileSync(filePath, "utf8");
  const promptData = JSON.parse(data);
  return promptData.prompt;
}

function updateWebsitePromptTemplate(inputResult) {
  let prompt = readWebsitePromptFromFile();
  prompt = prompt.replace("{{input_result}}", JSON.stringify(inputResult));
  return prompt;
}

async function main(url) {
  const { text: extractedText, matchedKeywords } = await extractTextFromURL(
    url
  );
  const keywordCounts = countKeywords(extractedText, matchedKeywords);

  console.log("Keyword counts:", keywordCounts);

  const categories = readCategoriesFromFile();
  const matchedCategories = categories.filter((category) =>
    matchedKeywords.includes(category.split("/").pop().split(" & ")[0])
  );

  let result;
  if (matchedKeywords.length >= 3 && matchedCategories.length > 0) {
    console.log(`Website matched keywords: ${matchedKeywords}`);
    console.log(`Website matched categories: ${matchedCategories}`);
    result = {
      url,
      matchedKeywords,
      matchedCategories,
    };
  } else {
    const updatedPrompt = updatePromptTemplate(url, extractedText);
    const openaiResponse = await generateOpenAIResponse(updatedPrompt);
    const keywordCounts = countKeywords(extractedText, matchedKeywords);
    console.log("Keyword counts:", keywordCounts);
    result = {
      url,
      message: "Unable to categorize. OpenAI Response: ",
      openaiResponse,
    };
    console.log(result.message, openaiResponse);
  }

  const updatedWebsitePrompt = updateWebsitePromptTemplate(result);
  const finalOpenAIResponse = await generateOpenAIResponseforwebsitePrompt(
    updatedWebsitePrompt
  );

  console.log("Final OpenAI response: ", finalOpenAIResponse);

  result.finalOpenAIResponse = finalOpenAIResponse;

  return result;
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
