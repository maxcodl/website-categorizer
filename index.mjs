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
    if ("finalOpenAIResponse" in result) {
      console.log(result.finalOpenAIResponse);
      const finalResponse = JSON.parse(result.finalOpenAIResponse);
      res.json(finalResponse);
    } else {
      res.json(result);
    }
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

function readIABFromFile() {
  const filePath = path.join(__dirname, "./files/IAB.json");
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data);
}

function findIABCategory(categoryName) {
  const IABData = readIABFromFile();
  // Remove any leading "/" from the category name
  const formattedCategoryName = categoryName.startsWith("/")
    ? categoryName.slice(1)
    : categoryName;
  const foundCategory = IABData.find((data) =>
    data["CATEGORY NAME"]
      .toLowerCase()
      .startsWith(formattedCategoryName.toLowerCase())
  );
  return foundCategory ? foundCategory.VALUE : null;
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
    console.log("\n\n");
    console.log("Matched keywords:", matchedKeywords);
    console.log("\n\n");
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
    console.log("\n\n");
    console.log("The text sent to OpenAI: ", text);
    console.log("\n\n");
    const response = await openaiInstance.chat.completions.create({
      model: "gpt-3.5-turbo-16k-0613",
      messages: [
        {
          role: "system",
          content: "You are an expert in website categorization.",
        },
        { role: "user", content: text },
      ],
      temperature: 1,
      max_tokens: 100,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
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
    console.log("\n\n");
    console.log("The text sent to OpenAI: ", text);
    console.log("\n\n");
    const response = await openaiInstance.chat.completions.create({
      model: "gpt-3.5-turbo-0613",
      messages: [
        {
          role: "system",
          content: "You are an expert in website categorization.",
        },
        {
          role: "user",
          content:
            'Given the input data below, extract and categorize the relevant information to determine the primary category and confidence level for the provided URL: Input data {{cnn.com}}: Please provide the extracted category with its confidence level for the given URL in a JSON format.{"domain": {"categories": [{"confidence": "confidence number","name": "category","IAB category": "category"],"domain_url": "samplewebsite.com"}}',
        },
        {
          role: "assistant",
          content:
            '{"domain": {"categories": [{"confidence": "0.99", "name": "IAB_category", "/News": "News"}], "domain_url": "https://www.cnn.com/"}}',
        },
        { role: "user", content: text },
      ],
      temperature: 1,
      max_tokens: 100,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    let responseText = "";
    if (
      response.choices &&
      response.choices[0] &&
      response.choices[0].message
    ) {
      responseText = response.choices[0].message.content;
    }
    console.log("\n\n");
    console.log("OpenAI Response for website prompt: ", responseText);
    console.log("\n\n");
    return responseText;
  } catch (error) {
    console.error("Error generating OpenAI response:", error);
    return "Error generating response.";
  }
}

function firstXWords(str, count) {
  return str.split(" ").slice(0, count).join(" ");
}

function readWebsitePromptFromFile() {
  const filePath = path.join(__dirname, "./files/websitePrompt.json");
  const data = fs.readFileSync(filePath, "utf8");
  const promptData = JSON.parse(data);
  return promptData.prompt;
}

function updateWebsitePromptTemplate(result, first100Words) {
  let prompt = readWebsitePromptFromFile();
  const parsedUrl = new URL(result.url); // Create a URL object
  const hostname = parsedUrl.hostname; // Get the hostname part of the URL

  prompt = prompt.replace("{{url}}", JSON.stringify(hostname));
  prompt = prompt.replace(
    "{{matched_keywords}}",
    JSON.stringify(result.matchedKeywords)
  );
  prompt = prompt.replace(
    "{{matched_categories}}",
    JSON.stringify(result.matchedCategories)
  );
  prompt = prompt.replace("{{content}}", JSON.stringify(first100Words));

  return prompt;
}

async function main(url) {
  const { text: extractedText, matchedKeywords } = await extractTextFromURL(
    url
  );
  const keywordCounts = countKeywords(extractedText, matchedKeywords);
  console.log("\n\n");
  console.log("\nKeyword counts:", keywordCounts);
  console.log("\n\n");
  const categories = readCategoriesFromFile();
  const matchedCategories = categories.filter((category) =>
    matchedKeywords.includes(category.split("/").pop().split(" & ")[0])
  );

  let result;
  if (matchedKeywords.length >= 4 && matchedCategories.length > 0) {
    console.log("\n\n");
    console.log(`\n\nWebsite matched keywords: ${matchedKeywords}`);
    console.log("\n\n");
    console.log(`\n\nWebsite matched categories: ${matchedCategories}`);
    result = {
      url,
      matchedKeywords,
      matchedCategories,
    };
  } else {
    const first100Words = firstXWords(extractedText, 100);
    const updatedPrompt = updatePromptTemplate(url, first100Words);
    const openaiResponse = await generateOpenAIResponse(updatedPrompt);
    const keywordCounts = countKeywords(extractedText, matchedKeywords);
    console.log("\n\nKeyword counts:", keywordCounts);
    result = {
      url,
      message: "Unable to categorize. OpenAI Response: ",
      openaiResponse,
    };
    console.log("\n\n");
    console.log(result.message, openaiResponse);
  }

  const first100Words = firstXWords(extractedText, 100);
  const updatedWebsitePrompt = updateWebsitePromptTemplate(
    result,
    first100Words
  );
  const finalOpenAIResponse = await generateOpenAIResponseforwebsitePrompt(
    updatedWebsitePrompt
  );

  console.log("\n\nFinal OpenAI response: ", finalOpenAIResponse);

  result.finalOpenAIResponse = finalOpenAIResponse;

  const finalResponseObj = JSON.parse(finalOpenAIResponse);
  if (
    finalResponseObj &&
    finalResponseObj.domain &&
    finalResponseObj.domain.categories
  ) {
    finalResponseObj.domain.categories.forEach((category) => {
      const categoryName = category.name;
      category["IAB_category"] = findIABCategory(categoryName);
    });
    result.finalOpenAIResponse = JSON.stringify(finalResponseObj);
  }
  return result;
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
});
