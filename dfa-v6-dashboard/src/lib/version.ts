export async function getAppVersion(){
    const res = await fetch("/api/version");
    if(res.ok){
        const data = await res.json();
        return data.version;
    }
}