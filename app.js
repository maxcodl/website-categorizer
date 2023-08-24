const express = require('express');
const app = express();
const openai = require('openai');
const request = require('request');
const { JSDOM } = require('jsdom');
const path = require('path');
const cheerio = require('cheerio');
const fs = require('fs');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Set the correct views directory path

require('dotenv').config();

openai.api_key = process.env.OPENAI_API_KEY;
const model_engine = "gpt-3.5-turbo-16k";
// Add the body-parser middleware
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

// Import the keywords from categoriesKeywords.json
const categoriesKeywords = require('./files/categoriesKeywords.json');


// Define the categorize_based_on_keywords function
function categorize_based_on_keywords(text) {
    const matched_categories = [];
    for (const category in categoriesKeywords) {
        const keywords = categoriesKeywords[category];
        const matched_keywords = [];
        for (const keyword of keywords) {
            const keyword_pattern = new RegExp(`\\b${keyword.toLowerCase()}\\b`);
            if (text.toLowerCase().match(keyword_pattern)) {
                matched_keywords.push(keyword);
            }
        }
        if (matched_keywords.length >= 3) {
            console.log(`For category '${category}', found matching keywords: ${matched_keywords}`);
            matched_categories.push(category);
        }
    }
    return matched_categories;
}

// Define the trimTextToWords function to trim text to a certain number of words
function trimTextToWords(text, maxWords) {
    const words = text.split(/\s+/);
    return words.slice(0, maxWords).join(' ');
}

// Read prompt from prompt.json file
const promptPath = path.join(__dirname, 'files', 'prompt.json');
const promptData = fs.readFileSync(promptPath, 'utf8');
const promptJson = JSON.parse(promptData);
const prompt = promptJson.prompt;

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/categorize', (req, res) => {
    let input_url = req.body.url;

    // Check if the input URL starts with "http" or "www"
    if (!input_url.startsWith('http') && !input_url.startsWith('https') && !input_url.startsWith('www')) {
        // Assuming it's a hostname without the "https://" prefix
        input_url = `https://www.${input_url}`;
    }

    function extract_text_from_website(url) {
        return new Promise((resolve, reject) => {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
            };
            request({ url, headers }, (error, response, body) => {
                if (error) {
                    reject(error);
                } else if (response.statusCode === 200) {
                    const $ = cheerio.load(body); // Load the HTML body using cheerio

                    const allowedTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'span'];
                    const all_text = allowedTags
                        .map(tag => $(tag).text()) // Get text content of each allowed tag
                        .join(' '); // Join all text content with a space

                    const trimmedText = all_text.replace(/\s+/g, ' ').trim(); // Replace multiple spaces with a single space
                    console.log("Extracted text:", trimmedText); // Log the text without whitespace
                    resolve(trimmedText);
                } else {
                    reject(new Error(`Response status code: ${response.statusCode}`));
                }
            });
        });
    }

    // Extract text content from the website
    extract_text_from_website(input_url).then(text_content => {
        // Check if the extracted text content is not empty
        if (text_content.trim() === '') {
            console.log("Extracted text content is empty.");
            res.render('result', { website: input_url, category: null, source: "empty" });
            return;
        }

        // Call your function to categorize based on keywords
        const categories = categorize_based_on_keywords(text_content);

        // If categories are found based on keywords
        if (categories && categories.length > 0) {
            console.log(`Categories assigned based on keyword match: ${categories}`);
            // Trim the text to 100 words
            const trimmed_text = trimTextToWords(text_content, 100);
            console.log("Prompt:", prompt);
            console.log("Trimmed Text:", trimmed_text);
            res.render('result', { website: input_url, categories: categories, source: "keyword" });
        } else {
            // Use OpenAI to generate the category
            openai.Completion.create({
                model: model_engine,
                prompt: `${prompt} ${trimmed_text}`,
                max_tokens: 150,
                n: 1,
                stop: null,
                temperature: 0.5,
                messages: [
                    {
                        role: "system",
                        content: "You are an expert in website categorization."
                    },
                    {
                        role: "user",
                        content: `This is a website [${input_url}]`
                    },
                    {
                        role: "assistant",
                        content: `{"role": "assistant", "content": "{\"website\": \"${input_url}\", \"category\": \"Others\"}"}`
                    },
                    {
                        role: "user", content: "Provide user input here"
                    }
                ],
            }).then(response => {
                const category = response.choices[0].text.trim();
                console.log(`Category assigned by OpenAI: ${category}`);
                res.render('result', { website: input_url, categories: categories, source: "keyword" }); // Use "categories" instead of "category"
            }).catch(error => {
                console.log("Failed to categorize using OpenAI:", error);
                res.render('result', { website: input_url, categories: null, source: "openai" }); // Use "categories" instead of "category"
            });
        }
    }).catch(error => {
        console.log("Failed to make OpenAI API call:", error);
        res.render('result', { website: input_url, categories: null, source: "openai" });
    });
});

app.get('/inputForm', (req, res) => {
    res.render('inputForm');
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
