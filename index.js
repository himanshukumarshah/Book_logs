import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({extended: true}));

const db = new pg.Client({
    host: "localhost",
    database: process.env.db,
    user: process.env.db_user,
    password: process.env.db_password,
    port: "5432"
});
db.connect();

app.get("/", async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM books ORDER BY rating DESC`);
        const books = result.rows;
        res.render("index.ejs", { books: books });
    } catch (err) {
        console.error("Database query error:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/sort", async (req, res) => {
  const sortby = req.body.sortby || "rating";
  const order = (sortby === 'title') ? "ASC" : "DESC";

  // Avoid SQL injection by allowing only specific fields
  const validSortFields = ["book_title", "rating", "read_date"];
  if (!validSortFields.includes(sortby)) return res.status(400).send("Invalid sort field");

  const result = await db.query(`SELECT * FROM books ORDER BY ${sortby} ${order}`);
  res.render("index.ejs", { books: result.rows });
});


app.get("/new_book", (req, res) => {
    res.render("new.ejs");
});

app.post("/new", async (req, res) => {
    //API to get cove image of the book title
    const bookTitle = encodeURIComponent(req.body.title.trim());
    let coverURL = "";
    try{
        const temp1 = await axios.get(`https://openlibrary.org/search.json?title=${bookTitle.trim()}`);
        if(temp1.data.docs.length > 0 && temp1.data.docs[0].cover_edition_key){
            const coverKey = temp1.data.docs[0].cover_edition_key;
            const temp2 = await axios.get(`https://covers.openlibrary.org/b/olid/${coverKey}.json`);
            coverURL = temp2.data.source_url;
        } else {
            console.log("No cover available for this book title.");
        }
    } catch(err){
        console.error("Error fetching cover:", err);
    }

    try{
        //Insertion of new data in database
        await db.query(
            "INSERT INTO books(book_title, read_date, rating, short_detail, cover_url, notes) VALUES ($1, $2, $3, $4, $5, $6)", [req.body.title, req.body.date, req.body.rating, req.body.description, coverURL, req.body.notes]
        );
    } catch(err){
        console.error("Error inserting book:", err);
        res.status(500).send("Internal Server Error");
    }
    res.redirect("/");
});

app.get("/view/:id", async (req, res) => {
    const bookID = Number(req.params.id);
    try{
        const result = await db.query(
            `SELECT * FROM books WHERE book_id = ${bookID}`
        );
        res.render("view.ejs", {book: result.rows[0]});
    } catch (err){
        console.log("Error fetching book with id", err);
    }
});

app.post("/book", async (req, res) => {
    if(req.body.action === 'edit'){
        try{
            const result = await db.query(
                `SELECT * FROM books WHERE book_id = ${req.body.bookID}`
            );
            res.render("new.ejs", {editBook: result.rows[0]});
        } catch(err){
            console.log("Error fetching book by id in /book", err);
        }
    }
    else if(req.body.action === 'delete'){
        try{
            await db.query(`DELETE FROM books WHERE book_id = ${req.body.bookID}`);
            res.redirect("/");
        } catch (err){
            console.log("Error deleting book", err);
        }
    }
});

app.post("/update", async(req, res) => {
    try{
        await db.query(
            "UPDATE books SET read_date = $1, rating = $2, short_detail = $3, notes = $4 WHERE book_id = $5", [req.body.date, req.body.rating, req.body.description, req.body.notes, req.body.bookID]
        );
        res.redirect("/");
    } catch(err){
        console.error("Error updating book:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(port, () => {
    console.log(`Server is active on port ${port}`);
});