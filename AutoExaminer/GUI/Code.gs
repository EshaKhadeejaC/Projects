
// Configuration for user management spreadsheet
const USER_SHEET_ID = "1qz8PT5yPq-bLEW9D1vtNKsp4riCb3NyXMSpeN9BORn0";
const USER_SHEET_NAME = "Autoexaminer";

// Drive Folder IDs
const QUESTION_UPLOAD_FOLDER = "1vhR1ZIrWVZFWsBaSHCSsKyaBguH20ae6";
const GENERATED_QUESTIONS_FOLDER = "1cPZFA2yBqEcCjN2BzyC2ZA2KzJeWtV25";
const ANSWER_SHEET_FOLDER = "1dTBmDUA3BI3USJxFSFaFBW_Vkxb232XM";
const ANSWER_KEY_FOLDER = "1l8er2IwNRBep_CfxKpz9scwrGnHbhGnV";
const EVALUATION_RESULTS_FOLDER = "1FZm1Fv5IHgkrZVALOdINgugrztJWM1KV";

// Create the initial HTML output when the web app loads
function doGet() {
  return HtmlService.createTemplateFromFile('Login')
    .evaluate()
    .setTitle('AUTOEXAMINER - Login/Register')
    .setFaviconUrl('https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_document_x32.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Include HTML files
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// User Registration Function
function registerUser(username, password, email) {
  try {
    var spreadsheet = SpreadsheetApp.openById(USER_SHEET_ID);
    var sheet = spreadsheet.getSheetByName(USER_SHEET_NAME);
    
    // Check if username already exists
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === username) {
        return { 
          success: false, 
          message: "Username already exists" 
        };
      }
    }
    
    // Hash the password (simple hash for demonstration)
    var hashedPassword = Utilities.base64Encode(password);
    
    // Append new user
    sheet.appendRow([
      username, 
      hashedPassword, 
      email, 
      new Date() // Registration date
    ]);
    
    return { 
      success: true, 
      message: "Registration successful" 
    };
  } catch (error) {
    Logger.log(error);
    return { 
      success: false, 
      message: "Registration failed: " + error.toString() 
    };
  }
}

// User Login Function
function validateLogin(username, password) {
  try {
    var spreadsheet = SpreadsheetApp.openById(USER_SHEET_ID);
    var sheet = spreadsheet.getSheetByName(USER_SHEET_NAME);
    
    var data = sheet.getDataRange().getValues();
    var hashedInputPassword = Utilities.base64Encode(password);
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === username && data[i][1] === hashedInputPassword) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log(error);
    return false;
  }
}

// Load main app after successful login
function loadMainApp() {
  return HtmlService.createTemplateFromFile('MainApp')
    .evaluate()
    .setTitle('AUTOEXAMINER - Main App')
    .getContent();
}

// Upload PDF for Question Generation with Renamed File
function uploadPDFForQuestions(fileData, fileName, difficultyLevel) {
  try {
    // Extract base64 data
    var base64Data = fileData.split(',')[1];
    
    // Create new filename format: <original filename>#<difficulty>
    var fileNameWithoutExt = fileName.replace(/\.pdf$/i, "");  // Only remove .pdf extension
    var newFileName = fileNameWithoutExt + "#" + difficultyLevel + ".pdf";
    
    // Create blob from base64 data with new filename
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'application/pdf', newFileName);
    
    // Upload to specific Drive folder
    var questionUploadFolder = DriveApp.getFolderById(QUESTION_UPLOAD_FOLDER);
    var file = questionUploadFolder.createFile(blob);
    
    // Generate a download key and store the file details
    var downloadKey = Utilities.getUuid();
    PropertiesService.getUserProperties().setProperty(downloadKey, JSON.stringify({
      fileId: file.getId(),
      originalFileName: fileName,
      uploadedFileName: newFileName,
      difficulty: difficultyLevel
    }));
    
    return {
      success: true,
      downloadKey: downloadKey,
      uploadedFileName: newFileName,
      message: "File uploaded successfully"
    };
  } catch (error) {
    Logger.log("ERROR in uploadPDFForQuestions: " + error.toString());
    return {
      success: false,
      message: "Failed to upload PDF: " + error.toString()
    };
  }
}

// Check for Generated Questions PDF
function checkForGeneratedQuestions(downloadKey) {
  try {
    // Retrieve stored file details
    var storedFileDetails = JSON.parse(PropertiesService.getUserProperties().getProperty(downloadKey));
    
    if (!storedFileDetails) {
      return { found: false, message: "Invalid download key" };
    }
    
    // Get the original filename without extension for matching
    var originalFileNameWithoutExt = storedFileDetails.originalFileName.replace(/\.[^/.]+$/, "");
    
    // Check the generated questions folder for matching files
    var generatedFolder = DriveApp.getFolderById(GENERATED_QUESTIONS_FOLDER);
    var files = generatedFolder.getFiles();
    
    while (files.hasNext()) {
      var file = files.next();
      var fileName = file.getName();
      
      // Check if the generated file name contains the original uploaded file name
      if (fileName.includes(originalFileNameWithoutExt)) {
        return {
          found: true,
          fileId: file.getId(),
          fileName: fileName
        };
      }
    }
    
    return { 
      found: false, 
      message: "Questions are still being generated. Please check back in a few minutes." 
    };
  } catch (error) {
    Logger.log("ERROR in checkForGeneratedQuestions: " + error.toString());
    return { 
      found: false, 
      message: "Error checking for generated questions: " + error.toString() 
    };
  }
}

// Get Generated Questions PDF for download
function getGeneratedQuestionsPDF(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        message: "File not found"
      };
    }
    
    // Get file content as base64 string
    var content = Utilities.base64Encode(file.getBlob().getBytes());
    
    return {
      success: true,
      content: content,
      fileName: file.getName(),
      mimeType: file.getMimeType(),
      message: "File retrieved successfully"
    };
  } catch (error) {
    Logger.log("ERROR in getGeneratedQuestionsPDF: " + error.toString());
    return {
      success: false,
      message: "Failed to retrieve PDF: " + error.toString()
    };
  }
}

// Upload answer sheet and answer key for evaluation
function uploadForEvaluation(answerSheetData, answerSheetName, answerKeyData, answerKeyName) {
  try {
    // Process answer sheet
    var answerSheetBase64 = answerSheetData.split(',')[1];
    var answerSheetBlob = Utilities.newBlob(
      Utilities.base64Decode(answerSheetBase64), 
      'application/pdf', 
      answerSheetName
    );
    
    // Process answer key
    var answerKeyBase64 = answerKeyData.split(',')[1];
    var answerKeyBlob = Utilities.newBlob(
      Utilities.base64Decode(answerKeyBase64), 
      'application/pdf', 
      answerKeyName
    );
    
    // Upload to respective folders
    var answerSheetFolder = DriveApp.getFolderById(ANSWER_SHEET_FOLDER);
    var answerKeyFolder = DriveApp.getFolderById(ANSWER_KEY_FOLDER);
    
    var answerSheetFile = answerSheetFolder.createFile(answerSheetBlob);
    var answerKeyFile = answerKeyFolder.createFile(answerKeyBlob);
    
    // Generate evaluation key
    var evaluationKey = Utilities.getUuid();
    PropertiesService.getUserProperties().setProperty(evaluationKey, JSON.stringify({
      answerSheetFileId: answerSheetFile.getId(),
      answerSheetName: answerSheetName,
      answerKeyFileId: answerKeyFile.getId(),
      answerKeyName: answerKeyName
    }));
    
    return {
      success: true,
      evaluationKey: evaluationKey,
      message: "Files uploaded successfully for evaluation"
    };
  } catch (error) {
    Logger.log("ERROR in uploadForEvaluation: " + error.toString());
    return {
      success: false,
      message: "Failed to upload files for evaluation: " + error.toString()
    };
  }
}

// Check for evaluation results
function checkForEvaluationResults(evaluationKey) {
  try {
    // Retrieve stored file details
    var storedFileDetails = JSON.parse(PropertiesService.getUserProperties().getProperty(evaluationKey));
    
    if (!storedFileDetails) {
      return { found: false, message: "Invalid evaluation key" };
    }
    
    // Get the answer sheet name without extension for matching
    var answerSheetNameWithoutExt = storedFileDetails.answerSheetName.replace(/\.[^/.]+$/, "");
    
    // Check the evaluation results folder for matching files
    var resultsFolder = DriveApp.getFolderById(EVALUATION_RESULTS_FOLDER);
    var files = resultsFolder.getFiles();
    
    while (files.hasNext()) {
      var file = files.next();
      var fileName = file.getName();
      
      // Check if the results file name contains the answer sheet name
      if (fileName.includes(answerSheetNameWithoutExt)) {
        return {
          found: true,
          fileId: file.getId(),
          fileName: fileName
        };
      }
    }
    
    return { 
      found: false, 
      message: "Evaluation is still in progress. Please check back in a few minutes." 
    };
  } catch (error) {
    Logger.log("ERROR in checkForEvaluationResults: " + error.toString());
    return { 
      found: false, 
      message: "Error checking for evaluation results: " + error.toString() 
    };
  }
}

// Get Evaluation Results PDF for download
function getEvaluationResultsPDF(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        message: "File not found"
      };
    }
    
    // Get file content as base64 string
    var content = Utilities.base64Encode(file.getBlob().getBytes());
    
    return {
      success: true,
      content: content,
      fileName: file.getName(),
      mimeType: file.getMimeType(),
      message: "File retrieved successfully"
    };
  } catch (error) {
    Logger.log("ERROR in getEvaluationResultsPDF: " + error.toString());
    return {
      success: false,
      message: "Failed to retrieve PDF: " + error.toString()
    };
  }
}

// Function to check for files directly in the evaluation results folder
function checkFilesInEvaluationFolder() {
  try {
    // Get the evaluation results folder
    var resultsFolder = DriveApp.getFolderById(EVALUATION_RESULTS_FOLDER);
    var files = resultsFolder.getFiles();
    
    // Get the most recent file (assuming it's the one we're looking for)
    var mostRecentFile = null;
    var mostRecentDate = null;
    
    while (files.hasNext()) {
      var file = files.next();
      var updateDate = file.getLastUpdated();
      
      if (mostRecentFile === null || updateDate > mostRecentDate) {
        mostRecentFile = file;
        mostRecentDate = updateDate;
      }
    }
    
    // If we found a file and it was updated within the last 5 minutes, consider it our target
    if (mostRecentFile !== null) {
      var now = new Date();
      var fiveMinutesAgo = new Date(now.getTime() - (5 * 60 * 1000));
      
      if (mostRecentDate >= fiveMinutesAgo) {
        return {
          found: true,
          fileId: mostRecentFile.getId(),
          fileName: mostRecentFile.getName()
        };
      }
    }
    
    return { 
      found: false, 
      message: "No recent evaluation results found." 
    };
  } catch (error) {
    Logger.log("ERROR in checkFilesInEvaluationFolder: " + error.toString());
    return { 
      found: false, 
      message: "Error checking for evaluation results: " + error.toString() 
    };
  }
}

// Function to check for a file in drive with specific filename pattern
function checkForFileInDrive(expectedFileName) {
  try {
    // Check the generated questions folder for matching files
    var folder = DriveApp.getFolderById(GENERATED_QUESTIONS_FOLDER);
    var files = folder.getFiles();
    
    while (files.hasNext()) {
      var file = files.next();
      var fileName = file.getName();
      
      // Check if the file name contains the expected pattern
      if (fileName.includes(expectedFileName)) {
        return {
          found: true,
          fileId: file.getId(),
          fileName: fileName
        };
      }
    }
    
    return { 
      found: false, 
      message: "File not found in Drive." 
    };
  } catch (error) {
    Logger.log("ERROR in checkForFileInDrive: " + error.toString());
    return { 
      found: false, 
      message: "Error checking for file in Drive: " + error.toString() 
    };
  }
}
