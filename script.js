const CONFIG = {
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    GEO_API: 'https://geocoding-api.open-meteo.com/v1/search',
    AIR_QUALITY_API: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    DEFAULT_CITY: 'São Paulo',
    UPDATE_INTERVAL: 10 * 60 * 1000, 
};

let state = {
    currentWeather: null,
    forecast: null,
    airQuality: null,
    location: null,
    theme: localStorage.getItem('theme') || 'light',
    history: JSON.parse(localStorage.getItem('searchHistory')) || [],
    chart: null
};

const elements = {
    appContainer: document.getElementById('app-container'),
    skeleton: document.getElementById('skeleton-screen'),
    mainContent: document.getElementById('main-content'),
    cityInput: document.getElementById('city-input'),
    geoBtn: document.getElementById('geo-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    autocomplete: document.getElementById('autocomplete-results'),
    searchHistory: document.getElementById('search-history'),
    cityName: document.getElementById('city-name'),
    currentDate: document.getElementById('current-date'),
    currentTemp: document.getElementById('current-temp'),
    weatherDesc: document.getElementById('weather-desc'),
    minTemp: document.getElementById('min-temp'),
    maxTemp: document.getElementById('max-temp'),
    feelsLike: document.getElementById('feels-like'),
    humidity: document.getElementById('humidity'),
    windSpeed: document.getElementById('wind-speed'),
    uvIndex: document.getElementById('uv-index'),
    hourlyContainer: document.getElementById('hourly-container'),
    dailyContainer: document.getElementById('daily-container'),
    aqiValue: document.getElementById('aqi-value'),
    aqiStatus: document.getElementById('aqi-status'),
    sunrise: document.getElementById('sunrise-time'),
    sunset: document.getElementById('sunset-time'),
    visibility: document.getElementById('visibility'),
    pressure: document.getElementById('pressure'),
    weatherIconLarge: document.getElementById('weather-icon-large'),
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadWeatherData(CONFIG.DEFAULT_CITY);
    setupEventListeners();
    initRevealOnScroll();
});

async function fetchWeather(lat, lon, timezone = 'auto') {
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,visibility',
        hourly: 'temperature_2m,precipitation_probability,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
        timezone: timezone,
        forecast_days: 7
    });

    const response = await fetch(`${CONFIG.WEATHER_API}?${params}`);
    if (!response.ok) throw new Error('Falha ao buscar dados climáticos');
    return await response.json();
}

async function fetchAirQuality(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'european_aqi,us_aqi,pm10,pm2_5',
        timezone: 'auto'
    });
    const response = await fetch(`${CONFIG.AIR_QUALITY_API}?${params}`);
    if (!response.ok) return null;
    return await response.json();
}

async function searchCity(query) {
    const params = new URLSearchParams({
        name: query,
        count: 5,
        language: 'pt',
        format: 'json'
    });
    const response = await fetch(`${CONFIG.GEO_API}?${params}`);
    if (!response.ok) return null;
    return await response.json();
}

async function loadWeatherData(query, isCoords = false) {
    showLoading();
    try {
        let lat, lon, name, country;

        if (isCoords) {
            lat = query.lat;
            lon = query.lon;
        
            name = "Sua Localização";
            country = "";
        } else {
            const geoData = await searchCity(query);
            if (!geoData.results || geoData.results.length === 0) {
                alert('Cidade não encontrada');
                hideLoading();
                return;
            }
            const city = geoData.results[0];
            lat = city.latitude;
            lon = city.longitude;
            name = city.name;
            country = city.country;
            addToHistory({ name, country, lat, lon });
        }

        const [weather, air] = await Promise.all([
            fetchWeather(lat, lon),
            fetchAirQuality(lat, lon)
        ]);

        state.currentWeather = weather.current;
        state.forecast = weather;
        state.airQuality = air;
        state.location = { name, country };

        updateUI();
        hideLoading();
    } catch (error) {
        console.error(error);
        alert('Erro ao carregar dados. Tente novamente.');
        hideLoading();
    }
}



function updateUI() {
    const { current, daily, hourly } = state.forecast;
    const loc = state.location;


    elements.cityName.textContent = loc.country ? `${loc.name}, ${loc.country}` : loc.name;
    elements.currentDate.textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    

    elements.currentTemp.textContent = Math.round(current.temperature_2m);
    elements.weatherDesc.textContent = getWeatherDescription(current.weather_code);
    elements.minTemp.textContent = Math.round(daily.temperature_2m_min[0]);
    elements.maxTemp.textContent = Math.round(daily.temperature_2m_max[0]);
    

    elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;
    elements.humidity.textContent = `${current.relative_humidity_2m}%`;
    elements.windSpeed.textContent = `${current.wind_speed_10m} km/h`;
    elements.uvIndex.textContent = daily.uv_index_max[0];
    

    elements.visibility.textContent = (current.visibility / 1000).toFixed(1);
    elements.pressure.textContent = current.pressure_msl;
    elements.sunrise.textContent = formatTime(daily.sunrise[0]);
    elements.sunset.textContent = formatTime(daily.sunset[0]);


    if (state.airQuality) {
        const aqi = state.airQuality.current.us_aqi;
        elements.aqiValue.textContent = aqi;
        elements.aqiStatus.textContent = getAQIStatus(aqi);
    }


    elements.weatherIconLarge.innerHTML = getWeatherIcon(current.weather_code, current.is_day);


    applyDynamicBackground(current.weather_code, current.is_day);

    renderHourly(hourly);
    renderDaily(daily);
    updateChart(hourly);
    
 
    lucide.createIcons();
    

    setTimeout(revealElements, 100);
}

function renderHourly(hourly) {
    elements.hourlyContainer.innerHTML = '';

    for (let i = 0; i < 24; i++) {
        const item = document.createElement('div');
        item.className = 'hourly-item';
        const time = new Date(hourly.time[i]).getHours();
        const isDay = time > 6 && time < 18;
        
        item.innerHTML = `
            <span class="time">${time}:00</span>
            ${getWeatherIcon(hourly.weather_code[i], isDay)}
            <span class="temp">${Math.round(hourly.temperature_2m[i])}°</span>
        `;
        elements.hourlyContainer.appendChild(item);
    }
}

function renderDaily(daily) {
    elements.dailyContainer.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(daily.time[i]);
        const dayName = i === 0 ? 'Hoje' : date.toLocaleDateString('pt-BR', { weekday: 'short' });
        
        const card = document.createElement('div');
        card.className = 'daily-card';
        card.setAttribute('data-reveal', '');
        
        card.innerHTML = `
            <span class="day">${dayName}</span>
            <div class="condition">
                ${getWeatherIcon(daily.weather_code[i], true)}
                <span>${getWeatherDescription(daily.weather_code[i])}</span>
            </div>
            <div class="precip">
                <i data-lucide="umbrella"></i>
                <span>${daily.precipitation_probability_max[i]}%</span>
            </div>
            <div class="temps">
                <span class="max">${Math.round(daily.temperature_2m_max[i])}°</span>
                <span class="min">${Math.round(daily.temperature_2m_min[i])}°</span>
            </div>
        `;
        elements.dailyContainer.appendChild(card);
    }
}





function getWeatherDescription(code) {
    const codes = {
        0: 'Céu limpo',
        1: 'Principalmente limpo', 2: 'Parcialmente nublado', 3: 'Nublado',
        45: 'Nevoeiro', 48: 'Nevoeiro com rima',
        51: 'Drizzle leve', 53: 'Drizzle moderado', 55: 'Drizzle denso',
        61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte',
        71: 'Neve leve', 73: 'Neve moderada', 75: 'Neve forte',
        80: 'Pancadas de chuva leves', 81: 'Pancadas de chuva moderadas', 82: 'Pancadas de chuva violentas',
        95: 'Trovoada', 96: 'Trovoada com granizo leve', 99: 'Trovoada com granizo forte'
    };
    return codes[code] || 'Desconhecido';
}

function getWeatherIcon(code, isDay) {
    let icon = 'sun';
    if (code === 0) icon = isDay ? 'sun' : 'moon';
    else if (code <= 3) icon = isDay ? 'cloud-sun' : 'cloud-moon';
    else if (code <= 48) icon = 'cloud';
    else if (code <= 55) icon = 'cloud-drizzle';
    else if (code <= 65) icon = 'cloud-rain';
    else if (code <= 75) icon = 'cloud-snow';
    else if (code <= 82) icon = 'cloud-lightning';
    else icon = 'cloud-lightning';

    return `<i data-lucide="${icon}"></i>`;
}

function getAQIStatus(aqi) {
    if (aqi <= 50) return 'Bom';
    if (aqi <= 100) return 'Moderado';
    if (aqi <= 150) return 'Insalubre para grupos sensíveis';
    return 'Insalubre';
}

function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}



function setupEventListeners() {
  
    let timeout;
    elements.cityInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        const query = e.target.value.trim();
        if (query.length < 3) {
            elements.autocomplete.classList.add('hidden');
            return;
        }
        timeout = setTimeout(() => showAutocomplete(query), 500);
    });


    elements.cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadWeatherData(elements.cityInput.value);
            elements.autocomplete.classList.add('hidden');
        }
    });


    elements.geoBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    loadWeatherData({ lat: pos.coords.latitude, lon: pos.coords.longitude }, true);
                },
                () => alert('Permissão de localização negada.')
            );
        }
    });


    elements.themeToggle.addEventListener('click', toggleTheme);
}

async function showAutocomplete(query) {
    const data = await searchCity(query);
    if (!data.results) return;

    elements.autocomplete.innerHTML = '';
    data.results.forEach(city => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = `
            <i data-lucide="map-pin"></i>
            <span>${city.name}, ${city.country}</span>
        `;
        item.addEventListener('click', () => {
            elements.cityInput.value = city.name;
            loadWeatherData(city.name);
            elements.autocomplete.classList.add('hidden');
        });
        elements.autocomplete.appendChild(item);
    });
    elements.autocomplete.classList.remove('hidden');
    lucide.createIcons();
}

function addToHistory(city) {
    state.history = [city, ...state.history.filter(h => h.name !== city.name)].slice(0, 5);
    localStorage.setItem('searchHistory', JSON.stringify(state.history));
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.body.className = state.theme + '-mode';
    localStorage.setItem('theme', state.theme);
    updateThemeIcons();
}

function initTheme() {
    document.body.className = state.theme + '-mode';
    updateThemeIcons();
}

function updateThemeIcons() {
    const moon = elements.themeToggle.querySelector('.moon-icon');
    const sun = elements.themeToggle.querySelector('.sun-icon');
    if (state.theme === 'dark') {
        moon.classList.add('hidden');
        sun.classList.remove('hidden');
    } else {
        moon.classList.remove('hidden');
        sun.classList.add('hidden');
    }
}

function showLoading() {
    elements.skeleton.classList.remove('hidden');
    elements.mainContent.classList.add('hidden');
}

function hideLoading() {
    elements.skeleton.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
}

function initRevealOnScroll() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, { threshold: 0.1 });

    state.revealObserver = observer;
}

function revealElements() {
    const items = document.querySelectorAll('[data-reveal]');
    items.forEach(item => state.revealObserver.observe(item));
}

function applyDynamicBackground(weatherCode, isDay) {
    const mainCard = document.querySelector('.current-main-card');
    
    
    mainCard.classList.remove('weather-sunny', 'weather-cloudy', 'weather-rainy', 'weather-stormy', 'weather-snowy', 'weather-night');
    
   
    if (!isDay) {
        mainCard.classList.add('weather-night');
    } else if (weatherCode === 0) {
        mainCard.classList.add('weather-sunny');
    } else if (weatherCode <= 3) {
        mainCard.classList.add('weather-cloudy');
    } else if (weatherCode <= 82) {
        if (weatherCode >= 71 && weatherCode <= 75) {
            mainCard.classList.add('weather-snowy');
        } else if (weatherCode >= 95) {
            mainCard.classList.add('weather-stormy');
        } else {
            mainCard.classList.add('weather-rainy');
        }
    } else {
        mainCard.classList.add('weather-stormy');
    }
}

function updateChart(hourly) {
    const ctx = document.getElementById('hourly-chart').getContext('2d');
    
    if (state.chart) {
        state.chart.destroy();
    }

    const labels = hourly.time.slice(0, 24).map(t => `${new Date(t).getHours()}:00`);
    const temps = hourly.temperature_2m.slice(0, 24);
    const precip = hourly.precipitation_probability.slice(0, 24);

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Temperatura (°C)',
                    data: temps,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Chance de Chuva (%)',
                    data: precip,
                    borderColor: '#60A5FA',
                    backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 1,
                    borderDash: [5, 5],
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { 
                    display: true,
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
                        usePointStyle: true,
                        padding: 15
                    }
                },
                filler: {
                    propagate: true
                }
            },
            scales: {
                y: {
                    display: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') },
                    position: 'left'
                },
                y1: {
                    display: true,
                    grid: { drawOnChartArea: false },
                    ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') },
                    position: 'right'
                },
                x: {
                    grid: { display: false },
                    ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') }
                }
            }
        }
    });
}

function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function addLoadingFeedback() {
    const skeleton = document.getElementById('skeleton-screen');
    skeleton.style.animation = 'fadeInUp 0.5s ease-out';
}

function smoothTransition() {
    const mainContent = document.getElementById('main-content');
    mainContent.style.animation = 'fadeInUp 0.6s ease-out';
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-notification';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #EF4444;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => errorDiv.remove(), 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    
    @keyframes shimmer {
        0% {
            background-position: -1000px 0;
        }
        100% {
            background-position: 1000px 0;
        }
    }
    
    .error-notification {
        font-weight: 500;
    }
`;
document.head.appendChild(style);

function optimizePerformance() {

    if (window.requestAnimationFrame) {
        window.addEventListener('scroll', throttle(() => {
            revealElements();
        }, 100));
    }
}




window.addEventListener('load', () => {
    optimizePerformance();

    setInterval(() => {
        if (state.location) {
            loadWeatherData(state.location.name);
        }
    }, CONFIG.UPDATE_INTERVAL);
});

window.addEventListener('offline', () => {
    showError('Você está offline. Alguns dados podem estar desatualizados.');
});

window.addEventListener('online', () => {
    showError('Conexão restaurada!');
});


if ('ontouchstart' in window) {
    document.body.classList.add('touch-device');
}