# HemaScan - AI-Powered Leukemia Detection System

## Overview

HemaScan is a cloud-based medical imaging web application that uses deep learning to assist healthcare professionals in detecting leukemia from blood smear microscopy images. The application combines a ResNet18 deep learning model deployed on AWS SageMaker with clinical decision support tools to provide accurate diagnoses with confidence scores and visual explanations. The system leverages AWS cloud services (SageMaker, S3, EC2, API Gateway) for scalable and reliable medical image analysis.

The application uses [FastAPI](https://fastapi.tiangolo.com/) for the backend API and [React](https://react.dev/) with TypeScript for the frontend. Image analysis is performed using AWS SageMaker Serverless Inference, and results are visualized using Grad-CAM (Gradient-weighted Class Activation Mapping) to show which areas of the image influenced the AI's decision.

These instructions walk you through building and running the application locally. The application can also be deployed to AWS (EC2 for backend, S3 for frontend).

### Model

The deep learning model is located in `backend/models/`:

- **Architecture**: ResNet18
- **Input Size**: 224x224 pixels
- **Task**: Binary classification (Leukemia vs Normal)
- **Preprocessing**: ImageNet normalization
- **Model File**: `leukemia_best.pt` (PyTorch format)
- **Configuration**: `config.json`

The model is deployed on AWS SageMaker Serverless Inference endpoint (`hemascan-endpoint`).

## Requirements

### Frontend Requirements
*   Node.js 18 or higher
*   npm (comes with Node.js)
*   Google OAuth Client ID (for authentication)

### Backend Requirements
*   Python 3.9 or higher
*   pip (Python package manager)
*   AWS Account (for SageMaker and S3 access)
*   OpenRouter API Key (for AI chat functionality)

### Optional Requirements
*   AWS Credentials (only needed if running backend locally and connecting to AWS services)

## Build and Run

### Step 1. Get the Project Files

If you have the project files in a zip file or folder:

1. Extract the project files to your desired location
2. Open a terminal/command prompt
3. Navigate to the project directory:

```bash
cd "Login Page Design"
```

**Or clone from Git repository:**
```bash
git clone https://github.com/badrZah/Hemascan-website.git
cd Hemascan-website
```

### Step 2. Set Up Frontend

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   Create a `.env` file in the root directory:
   ```env
   VITE_GOOGLE_CLIENT_ID=1062840610813-i6bv0k2a3qr0tptjmtqhm74u0dh1p9bp.apps.googleusercontent.com
   VITE_API_URL=http://localhost:8000
   VITE_VITALS_API_URL=https://wbqi1yjvy2.execute-api.eu-north-1.amazonaws.com/prod/vitals
   ```

### Step 3. Set Up Backend

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment (recommended):**
   ```bash
   python -m venv venv
   ```
   
   **Activate virtual environment:**
   - On Linux/Mac: `source venv/bin/activate`
   - On Windows: `venv\Scripts\activate`

3. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

   The `requirements.txt` file will install all necessary Python packages including FastAPI, uvicorn, boto3, and python-dotenv.

4. **Create environment file:**
   Create a `.env` file in the `backend/` directory:
   ```env
   REGION=eu-north-1
   SAGEMAKER_ENDPOINT=hemascan-endpoint
   RESULTS_S3_BUCKET=hemascan-results-433864969866
   OPENROUTER_API_KEY=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
   ```

### Step 4. Run the Application

1. **Start Backend Server** (Terminal 1):
   ```bash
   cd backend
   uvicorn main:app --reload
   ```
   
   The backend API will be available at `http://localhost:8000`
   API documentation: `http://localhost:8000/docs` (also available on AWS deployments)

2. **Start Frontend Development Server** (Terminal 2):
   ```bash
   npm run dev
   ```
   
   The frontend will be available at `http://localhost:3000`

3. **Access the Application:**
   - Open your browser and navigate to `http://localhost:3000`
   - You will see the login page
   - Click "Sign in with Google" to authenticate
   - After successful login, you'll be redirected to the Dashboard

### Step 5. Use the Application

1. **Upload Image:**
   - Drag and drop a blood smear image (JPEG, PNG, or TIFF) into the upload area, or click to select a file
   - Maximum file size: 10 MB

2. **Analyze Image:**
   - Click the "Analyze" button
   - Wait for analysis to complete (typically 10-30 seconds)
   - View results showing diagnosis (Leukemia or Normal) and confidence score

3. **Generate Grad-CAM Visualization:**
   - After analysis, click "Generate Grad-CAM"
   - Wait for visualization to generate (typically 15-30 seconds)
   - View the heatmap overlay showing areas the AI focused on

4. **Chat with AI Assistant:**
   - Type your question in the chat input box
   - Click "Send" or press Enter
   - The AI will provide clinical insights based on your analysis results

5. **Save Results:**
   - Click "Save Result" to generate and download a PDF report
   - The report includes diagnosis, confidence score, report metadata, and medical disclaimers

## API Endpoints

The backend provides the following endpoints:

- `GET /` - Health check and endpoint list
- `GET /health` - Health check endpoint
- `GET /test` - Test endpoint
- `POST /api/auth/google` - Google OAuth authentication
- `POST /api/analyze` - Analyze blood smear image
- `POST /api/generate-gradcam` - Generate Grad-CAM visualization
- `POST /api/chat` - Chat with AI clinical assistant

### Interactive API Documentation

FastAPI automatically generates interactive API documentation:

- **Local Development**: `http://localhost:8000/docs` (Swagger UI)
- **AWS EC2 Deployment**: `http://13.49.57.101:8000/docs` (Production backend)

The documentation allows you to:
- View all endpoints with detailed descriptions
- See request/response schemas
- Test endpoints directly from the browser
- View example requests and responses

## Project Structure

```
Login Page Design/
├── src/                          # Frontend source code
│   ├── components/
│   │   ├── Login.tsx            # Google OAuth login
│   │   ├── Dashboard.tsx         # Main analysis dashboard
│   │   └── ui/                  # UI component library
│   ├── App.tsx                  # Main application component
│   └── main.tsx                 # Entry point
│
├── backend/                      # Backend API server
│   ├── main.py                  # FastAPI application
│   ├── lambda_handler.py        # AWS Lambda handler
│   ├── requirements.txt         # Python dependencies
│   └── models/                  # ML model files
│       ├── leukemia_best.pt    # Trained PyTorch model
│       └── config.json         # Model configuration
│
├── package.json                 # Frontend dependencies
├── vite.config.ts              # Vite configuration
└── index.html                  # HTML entry point
```

## Technologies Used

- **Frontend**: React 18.3.1, TypeScript, Vite 6.3.5, Radix UI, TailwindCSS
- **Backend**: FastAPI 0.104.1, Python 3.9+, Uvicorn
- **ML/AI**: ResNet18 (PyTorch), AWS SageMaker, DeepSeek R1 (via OpenRouter)
- **Cloud**: AWS (SageMaker, S3, EC2, Lambda, API Gateway)

## Troubleshooting

### Frontend Issues
- **Port already in use**: Change port in `vite.config.ts` or kill process using port 3000
- **Google OAuth not working**: Verify `VITE_GOOGLE_CLIENT_ID` is set correctly in `.env` file
- **API connection errors**: Check `VITE_API_URL` points to running backend

### Backend Issues
- **SageMaker endpoint not found**: Verify endpoint name in environment variables matches actual SageMaker endpoint
- **CORS errors**: Backend is configured to allow all origins (development only)
- **OpenRouter API errors**: Verify `OPENROUTER_API_KEY` is set correctly

## License

This project is developed for educational purposes as part of a graduation project.

All rights reserved. This software is provided for academic and educational use only.

## Authors
Mshari Ahmad bin hussainan
Fahad Ali Alghamdi
Bader Ali Alzahrani

Developed as a Graduation Project

---

For detailed user instructions, see `USER_MANUAL.md`