const btn = document.querySelector(".changeColorBtn");

btn.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id }, //means if we want to inject any script so, decide target tab
    function: pickColor, //what to inject
  });
});

function pickColor () {
    try{
        
    }catch(err){
        console.error("An error occured: ", err);
    }
}
