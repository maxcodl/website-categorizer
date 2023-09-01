const axios = require("axios");
const cheerio = require("cheerio");

// Load keywords and OpenAI prompts from JSON files
const keywords = require("./files/categoriesKeywords.json");
const openaiPrompts = require("./files/prompt.json");

const fs = require("fs");
const path = require("path");

function getKeywordsFromFile() {
  const filePath = path.join(__dirname, "./files/words.txt");
  const data = fs.readFileSync(filePath, "utf8");
  return data.split("\n");
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

async function generateOpenAIResponse(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/engines/davinci-codex/completions",
      {
        prompt: openaiPrompts.prompt.replace("{{text}}", text),
        max_tokens: 50, // Adjust the number of tokens as needed
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-jdbfksdjfi7dsf9sd7ft9sdgbfidsbfdfdsfsrnk", // Replace with your OpenAI API key
        },
      }
    );

    return response.data.choices[0].text;
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

    console.log("Matched Keywords:", matchedKeywords);

    // for keywords from external file
    const fileKeywordsMatched = fileKeywords.filter((keyword) =>
      matchedKeywords.some((extractedKeyword) =>
        keyword.endsWith(extractedKeyword)
      )
    );
    console.log("File Keywords Matched: ", fileKeywordsMatched);
  } else {
    const openaiResponse = await generateOpenAIResponse(extractedText);
    console.log("Unable to categorize. OpenAI Response:", openaiResponse);
  }
}

const enteredURL = "https://medium.com"; // Replace with the URL you want to categorize
main(enteredURL);
