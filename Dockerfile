FROM node:latest
COPY . /app/
WORKDIR /app/
RUN npm install
RUN npm run build
ENTRYPOINT ["node"]
CMD ["dist/index.js"]