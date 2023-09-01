import axios from "axios";
import cheerio from "cheerio";
import openai from "openai";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import keywords from "./files/categoriesKeywords.json" assert { type: "json" };

const openaiInstance = new openai({
  apiKey: "sk-jdbfksdjfi7dsf9sd7ft9sdgbfidsbfdfdsfsrnk",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    if (response.choices && response.choices[0] && response.choices[0].message) {
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
  // for predefined categories
  const category = categorizeWebsite(extractedText);

  if (category) {
    console.log(`Website categorized as: ${category}`);
    const matchedKeywords = keywords[category].filter((keyword) =>
      extractedText.includes(keyword)
    );

    if (matchedKeywords.length > 0) {
      console.log("Matched Keywords:", matchedKeywords);

      // for keywords from external file
      const fileKeywordsMatched = fileKeywords.filter((keyword) =>
        matchedKeywords.some((extractedKeyword) =>
          keyword.endsWith(extractedKeyword)
        )
      );
      console.log("File Keywords Matched: ", fileKeywordsMatched);
      if (fileKeywordsMatched.length > 0) {
        console.log("keyword matched");
        return;
      }
    }
  }

  const updatedPrompt = updatePromptTemplate(url, extractedText);
  const aiResponseObject = await generateOpenAIResponse(updatedPrompt);
  console.log(
    "Unable to categorize. OpenAI Response:",
    JSON.stringify(aiResponseObject, null, 2)
  );
}
const actualURL = "https://cnn.com"; // Replace with the URL you want to categorize
main(actualURL);
