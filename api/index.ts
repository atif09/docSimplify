import express from "express";

const app = express();

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.post("/api/process", async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Process API working"
    });
  } catch (error: any) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

export default app;